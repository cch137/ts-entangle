export class EKey {
  static get(key: string | string[]) {
    if (!Array.isArray(key)) key = [key];
    const length = key.length;
    const record = EKey.record;
    for (const [keys, entangleKey] of record) {
      if (keys.length === length && keys.every((v, i) => v === key[i]))
        return entangleKey;
    }
    return new EKey(key);
  }

  private static readonly record: [Readonly<string[]>, EKey][] = [];

  readonly keys: Readonly<string[]>;

  private constructor(keys: string[]) {
    EKey.record.push([(this.keys = Object.freeze([...keys])), this]);
  }
}

export default class Id {
  static create() {
    return new Id().toString();
  }

  private static readonly randoms = new Map<number, number[]>();

  readonly uint8Array: Uint8Array;

  get timestamp() {
    return new DataView(this.uint8Array.buffer).getInt32(0) * 1000;
  }

  constructor() {
    const array = new Uint8Array(8);
    const view = new DataView(array.buffer);

    while (true) {
      const time = Math.floor(Date.now() / 1000);
      const rand = Math.floor(Math.random() * 0x100000000);
      if (!Id.randoms.has(time)) {
        Id.randoms.set(time, []);
        setTimeout(() => Id.randoms.delete(time), 9);
      }
      const randoms = Id.randoms.get(time)!;
      if (randoms.includes(rand)) continue;
      randoms.push(rand);
      view.setInt32(0, time);
      view.setInt32(4, rand);
      this.uint8Array = array;
      break;
    }
  }

  toString() {
    return btoa(
      String.fromCharCode.apply(
        null,
        [...this.uint8Array].map((i) => Number(i))
      )
    )
      .replace(/[=]+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }
}
