import type { OmitKeys, PickKeys } from "@cch137/xbject";

export type AsyncFunctionWrapper<T extends Function> = T extends (
  ...args: infer A
) => infer R
  ? R extends Promise<any>
    ? (...args: A) => R
    : (...args: A) => Promise<R>
  : never;

export type AsyncWrappedObject<T extends object> = {
  [K in keyof T]: T[K] extends Function ? AsyncFunctionWrapper<T[K]> : T[K];
};

export type ShuttleOptions = {
  salts?: number[];
  md5?: boolean;
};

/**
 * `k` key is the path to the value, \
 * eg1. `obj.name` -> k: `"name"` or `["name"]` \
 * eg2. `obj.person.cars[3]` -> k: `["person", "cars", "3"]`
 */
export type EntangleRequest =
  | {
      s: string; // service id
      o: "S"; // operation: subscribe
    }
  | {
      s: string; // service id
      o: "U"; // operation: unsubscribe
    }
  | {
      s: string; // service id
      o: "R"; // operation: read
      k: string; // key
      i?: string; // call id (a random id)
    }
  | {
      s: string; // service id
      o: "W"; // operation: write
      k: string; // key
      v: any; // value
    }
  | {
      s: string; // service id
      o: "D"; // operation: delete
      k: string; // key
    }
  | {
      s: string; // service id
      o: "C"; // operation: call function
      i: string; // call id (a random id)
      k: string; // key
      a?: any[]; // arguments
    };

export type EntangleResponse =
  | {
      s: string; // service id
      o: "W"; // operation: write
      k: string; // key
      v: any; // value
      i?: string; // call id (a random id)
    }
  | {
      s: string; // service id
      o: "F"; // operation: assign function
      k: string; // key
      i?: string; // call id (a random id)
    }
  | {
      s: string; // service id
      o: "D"; // operation: delete
      k: string; // key
      i?: string; // call id (a random id)
    }
  | {
      s: string; // service id
      o: "Y"; // operation: ready
    }
  | {
      s: string; // service id
      o: "C"; // operation: called result
      i: string; // call id (a random id)
      e: string; // error message
    }
  | {
      s: string; // service id
      o: "C"; // operation: called result
      i: string; // call id (a random id)
      v: any; // return value
    }
  | {
      s: string; // service id
      o: "E"; // operation: error
      m: string; // message
    };

export type FreezeKeys<
  T,
  K extends Array<keyof T> | undefined = undefined
> = K extends undefined
  ? T
  : {
      readonly [P in Extract<
        keyof T,
        K extends Array<infer U> ? U : never
      >]: T[P];
    } & {
      [P in Exclude<keyof T, K extends Array<infer U> ? U : never>]: T[P];
    };

export type EntangledObject<
  T extends object,
  OmittedKeys extends Array<keyof T> | undefined = undefined,
  PickedKeys extends Array<keyof T> | undefined = undefined,
  ReadonlyKeys extends Array<keyof T> | undefined = undefined
> = AsyncWrappedObject<
  OmitKeys<PickKeys<FreezeKeys<T, ReadonlyKeys>, PickedKeys>, OmittedKeys>
>;
