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

export type ServerResponse = ServerSetter | ServerFunctionReturn;

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

export type PickKeys<
  T,
  K extends Array<keyof T> | undefined = undefined
> = K extends undefined
  ? T
  : Pick<T, K extends Array<infer U> ? Extract<keyof T, U> : never>;

export type OmitKeys<
  T,
  K extends Array<keyof T> | undefined = undefined
> = K extends undefined ? T : Omit<T, K extends Array<infer U> ? U : never>;

export type LimitedObject<
  T extends object,
  O extends Array<keyof T> | undefined = undefined,
  P extends Array<keyof T> | undefined = undefined
> = OmitKeys<PickKeys<T, P>, O>;

export type ASOClientObject<
  T extends object,
  O extends Array<keyof T> | undefined = undefined,
  P extends Array<keyof T> | undefined = undefined
> = AsyncWrappedObject<LimitedObject<T, O, P>>;
