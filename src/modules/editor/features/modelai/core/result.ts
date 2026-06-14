// @ts-nocheck
export class Result<T, E = string> {
  readonly #isOk: boolean;
  readonly #value: T | undefined;
  readonly #error: E | undefined;

  get isOk(): boolean {
    return this.#isOk;
  }
  get value(): T {
    return this.#value!;
  }
  get error(): E {
    return this.#error!;
  }

  constructor(isOk: boolean, value: T | undefined, error: E | undefined) {
    this.#isOk = isOk;
    this.#value = value;
    this.#error = error;
  }

  unchecked(): T | undefined {
    return this.#value;
  }

  static ok<T>(value: T): Result<T, never> {
    return new Result(true, value, undefined) as any;
  }

  static err<E>(error: E): Result<any, E> {
    return new Result(false, undefined, error) as any;
  }
}
