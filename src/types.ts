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

export type ServerReady = {
  op: "ready";
};

export type ServerSetter = {
  op: "set";
  key: string;
  func: boolean;
  value: any;
};

export type ServerFunctionReturn =
  | {
      op: "return";
      uuid: string;
      value: any;
    }
  | {
      op: "return";
      uuid: string;
      error: true;
      message: string;
    };

export type ServerResponse = ServerReady | ServerSetter | ServerFunctionReturn;

export type ClientCall = {
  op: "call";
  uuid: string;
  name: string;
  args: any[];
};

export type ClientSetter<T extends object> = {
  op: "set";
  key: keyof T;
  value: any;
};

export type ClientRequest<T extends object> = ClientCall | ClientSetter<T>;

export type Adaptor = {
  isEntangled: () => boolean;
  connect: () => void;
  disconnect: () => void;
  send: (data: Uint8Array) => void;
};

export type PickKeys<
  T,
  K extends Array<keyof T> | undefined = undefined
> = K extends undefined ? T : Pick<T, K extends Array<infer U> ? U : never>;

export type OmitKeys<
  T,
  K extends Array<keyof T> | undefined = undefined
> = K extends undefined ? T : Omit<T, K extends Array<infer U> ? U : never>;

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
