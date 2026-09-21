// Minimal writer for Bedrock's NBT: little-endian, uncompressed. Only the tag types .mcstructure needs.
export type NbtValue =
  | { type: "byte"; value: number }
  | { type: "int"; value: number }
  | { type: "string"; value: string }
  | { type: "intList"; value: Int32Array | number[] }
  | { type: "list"; elementType: "compound" | "intList" | "end"; value: NbtValue[] }
  | { type: "compound"; value: Record<string, NbtValue> };

const TAG = { end: 0, byte: 1, int: 3, string: 8, list: 9, compound: 10 } as const;

export const byte = (value: number): NbtValue => ({ type: "byte", value });
export const int = (value: number): NbtValue => ({ type: "int", value });
export const string = (value: string): NbtValue => ({ type: "string", value });
export const intList = (value: Int32Array | number[]): NbtValue => ({ type: "intList", value });
export const compound = (value: Record<string, NbtValue>): NbtValue => ({ type: "compound", value });
export const list = (elementType: "compound" | "intList" | "end", value: NbtValue[]): NbtValue => ({
  type: "list",
  elementType,
  value,
});

class Writer {
  private chunks: Uint8Array[] = [];

  bytes(data: Uint8Array) {
    this.chunks.push(data);
  }
  u8(value: number) {
    this.chunks.push(Uint8Array.of(value & 0xff));
  }
  i32(value: number) {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setInt32(0, value, true);
    this.chunks.push(data);
  }
  text(value: string) {
    const data = new TextEncoder().encode(value);
    const length = new Uint8Array(2);
    new DataView(length.buffer).setUint16(0, data.length, true);
    this.chunks.push(length, data);
  }
  finish(): Uint8Array {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function tagId(value: NbtValue): number {
  // A list of ints is an NBT "list of int", not an int array: that is what .mcstructure uses.
  return value.type === "intList" ? TAG.list : TAG[value.type];
}

function writePayload(writer: Writer, value: NbtValue) {
  switch (value.type) {
    case "byte":
      writer.u8(value.value);
      break;
    case "int":
      writer.i32(value.value);
      break;
    case "string":
      writer.text(value.value);
      break;
    case "intList": {
      writer.u8(TAG.int);
      writer.i32(value.value.length);
      const data = new Uint8Array(value.value.length * 4);
      const view = new DataView(data.buffer);
      for (let i = 0; i < value.value.length; i++) view.setInt32(i * 4, value.value[i]!, true);
      writer.bytes(data);
      break;
    }
    case "list":
      writer.u8(value.elementType === "compound" ? TAG.compound : value.elementType === "intList" ? TAG.list : TAG.end);
      writer.i32(value.value.length);
      for (const element of value.value) writePayload(writer, element);
      break;
    case "compound":
      for (const [name, child] of Object.entries(value.value)) {
        writer.u8(tagId(child));
        writer.text(name);
        writePayload(writer, child);
      }
      writer.u8(TAG.end);
      break;
  }
}

/** Serializes a root compound (with an empty name, as Bedrock expects). */
export function encodeNbt(root: NbtValue): Uint8Array {
  const writer = new Writer();
  writer.u8(tagId(root));
  writer.text("");
  writePayload(writer, root);
  return writer.finish();
}
