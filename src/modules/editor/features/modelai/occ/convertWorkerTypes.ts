// @ts-nocheck
export type OccSourceFormat = "step" | "iges";

export type OccConvertedNode =
  | {
      type: "group";
      name: string;
      children: OccConvertedNode[];
    }
  | {
      type: "shape";
      name: string;
      brep: string;
      faceColors?: string[];
      shapeColor?: string;
    };

export type OccConvertRequest = {
  id: string;
  format: OccSourceFormat;
  data: ArrayBuffer;
  wasmUrl: string;
};

export type OccConvertSuccess = {
  id: string;
  ok: true;
  root: OccConvertedNode;
};

export type OccConvertFailure = {
  id: string;
  ok: false;
  error: string;
};

export type OccConvertResponse = OccConvertSuccess | OccConvertFailure;
