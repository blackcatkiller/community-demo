// @ts-nocheck
// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Observable } from "../core/observable";
import type { IDocument } from "../core/types";

const propertiesMap = new Map<
  new (...args: any[]) => any,
  Array<PropertyInfo>
>();
const reflectMap = new Map<string, RefelectData>();

export type PropertyInfo = {
  name: string;
  readonly?: boolean;
};

export const InternalClassName = "__cla$$__";

export type SerializedData = { [x: string]: any };

export type Serialized = { [InternalClassName]: string } & SerializedData;

export interface RefelectData {
  ctor: new (...args: any[]) => any;
  serialize?: (target: any) => SerializedData;
  deserialize?: (...args: any[]) => any;
}

export function registerReflect(
  data: RefelectData,
  name?: string,
  props?: {
    type: any;
    props: PropertyInfo[];
  }
) {
  const actualName = name ?? data.ctor.name;
  if (reflectMap.has(actualName)) {
    console.warn(`Class ${actualName} already registered, skip.`);
    return;
  }
  reflectMap.set(actualName, data);
  if (props !== undefined) {
    const ps = propertiesMap.get(props.type);
    if (ps === undefined) {
      propertiesMap.set(props.type, props.props);
    } else {
      ps.push(...props.props);
    }
  }
}

type SerializableTypedArray = Float32Array | Uint32Array;

export function registerTypeArray(
  typeArray: new (array: number[]) => SerializableTypedArray
) {
  const data = {
    ctor: typeArray,
    serialize: (target: SerializableTypedArray) => {
      return {
        buffer: Array.from(target)
      };
    },
    deserialize: (data: any) => {
      return new typeArray(data.buffer);
    }
  };

  registerReflect(data, typeArray.name, {
    type: typeArray.prototype,
    props: [
      {
        name: "buffer",
        readonly: true
      }
    ]
  });
}
const MaybeFloat16Array = globalThis.Float16Array as
  | (new (array: number[]) => SerializableTypedArray)
  | undefined;
if (MaybeFloat16Array) {
  registerTypeArray(MaybeFloat16Array);
}
registerTypeArray(Float32Array);
registerTypeArray(Uint32Array);

export function serializable<T>(options?: {
  deserialize?: (...args: any[]) => T;
  serialize?: (target: T) => SerializedData;
}) {
  return (target: new (options: any) => T) => {
    registerReflect({
      ctor: target,
      ...options
    });
  };
}

export function serialize() {
  return (target: any, property: string) => {
    let props = propertiesMap.get(target);
    if (props === undefined) {
      props = [];
      propertiesMap.set(target, props);
    }
    props.push({
      name: property
    });
  };
}

export class Serializer {
  public static deserializeObject(document: IDocument, data: Serialized) {
    const props: Record<string, any> = { document };
    for (const key of Object.keys(data)) {
      props[key] = Serializer.deserialValue(document, data[key]);
    }

    const className = props[InternalClassName];
    const reflectEntry = className ? reflectMap.get(className) : undefined;
    const instance = Serializer.deserializeInstance(props);
    // Custom deserialize fully hydrates the instance; deserializeProperties would
    // overwrite typed fields (e.g. Matrix4 transform) with raw JSON primitives.
    if (!reflectEntry?.deserialize) {
      Serializer.deserializeProperties(document, instance, props);
    }
    return instance;
  }

  static deserializeInstance(data: Record<string, any>) {
    const className = data[InternalClassName];
    if (!className) {
      console.warn(`${data} cannot be deserialize.`);
      return data;
    }

    if (!reflectMap.has(data[InternalClassName])) {
      throw new Error(
        `${data[InternalClassName]} cannot be deserialize. Did you forget to add the decorator @Serializer.register?`
      );
    }

    const { ctor, deserialize } = reflectMap.get(className)!;
    if (deserialize) {
      return deserialize(data);
    }
    return new ctor(data);
  }

  static deserialValue(document: IDocument, value: any) {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value.map(v => {
        if (v === null || v === undefined) {
          return undefined;
        }
        return typeof v === "object"
          ? Serializer.deserializeObject(document, v)
          : v;
      });
    }
    return (value as Serialized)[InternalClassName]
      ? Serializer.deserializeObject(document, value)
      : value;
  }

  static deserializeProperties(
    document: IDocument,
    instance: any,
    data: Record<string, any>
  ) {
    const keys = Object.keys(data);
    for (const key of keys) {
      if (
        key !== InternalClassName &&
        document !== data[key] &&
        instance[key] !== data[key]
      ) {
        if (instance instanceof Observable) {
          (instance as any).setPrivateValue(key as any, data[key]);
        } else if (this.isWritable(instance, key)) {
          instance[key] = Serializer.deserialValue(document, data[key]);
        }
      }
    }
  }

  static isWritable(obj: any, prop: string) {
    while (obj !== null) {
      const desc = Object.getOwnPropertyDescriptor(obj, prop);
      if (desc) {
        if (desc.set) return true;
        return desc.writable === true;
      }
      obj = Object.getPrototypeOf(obj);
    }
    return false;
  }

  static serializeObject(target: object): Serialized {
    const className = target.constructor.name;
    if (!reflectMap.has(className)) {
      console.log(target);

      throw new Error(
        `Type ${target.constructor.name} is not registered, please add the @Serializer.register decorator.`
      );
    }
    const data = reflectMap.get(className)!;
    const properties =
      data.serialize?.(target) ?? Serializer.serializeProperties(target);
    return {
      ...properties,
      [InternalClassName]: className
    };
  }

  static serializeProperties(target: object) {
    const data: Record<string, any> = {};

    const props = Serializer.getAllKeysOfPrototypeChain(target, propertiesMap);
    for (const prop of props) {
      const value = (target as any)[prop.name];
      if (Array.isArray(value)) {
        data[prop.name] = value.map(v => Serializer.serializePropertyValue(v));
      } else {
        data[prop.name] = Serializer.serializePropertyValue(value);
      }
    }
    return data;
  }

  private static serializePropertyValue(value: any) {
    const type = typeof value;
    if (type === "object") {
      return Serializer.serializeObject(value);
    }
    if (type !== "function" && type !== "symbol") {
      return value;
    }
    throw new Error(`Unsupported serialized object: ${value}`);
  }

  private static getAllKeysOfPrototypeChain(
    target: object,
    map: Map<new (...args: any[]) => any, Array<PropertyInfo>>
  ) {
    const keys: PropertyInfo[] = [];
    let prototype = Object.getPrototypeOf(target);
    while (prototype !== null) {
      const k = map.get(prototype);
      if (k) keys.push(...k.values());
      prototype = Object.getPrototypeOf(prototype); // prototype chain
    }
    return new Set(keys);
  }
}
