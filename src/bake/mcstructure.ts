// Writes Bedrock .mcstructure files. Cells that are not set stay "structure void" (index -1):
// placing the structure leaves whatever is already in the world there, so a baked tree does not
// carve an air box out of hillsides or neighboring trees.
import { type NbtValue, byte, compound, encodeNbt, int, intList, list, string } from "./nbt.ts";

export interface BlockType {
  name: string;
  states?: Record<string, string | number | boolean>;
}

// Block-state format version stamped on palette entries (1.21.0.3). The game upgrades older
// versions on load, so this does not need to track the current release.
const BLOCK_VERSION = 18153475;

export class StructureBuilder {
  readonly size: readonly [x: number, y: number, z: number];
  private readonly indices: Int32Array;
  private readonly palette: BlockType[] = [];
  private readonly paletteLookup = new Map<string, number>();

  constructor(sizeX: number, sizeY: number, sizeZ: number) {
    this.size = [sizeX, sizeY, sizeZ];
    this.indices = new Int32Array(sizeX * sizeY * sizeZ).fill(-1);
  }

  set(x: number, y: number, z: number, block: BlockType): void {
    const [sizeX, sizeY, sizeZ] = this.size;
    if (x < 0 || y < 0 || z < 0 || x >= sizeX || y >= sizeY || z >= sizeZ) {
      throw new RangeError(`Block ${x},${y},${z} is outside the ${sizeX}x${sizeY}x${sizeZ} structure`);
    }
    const key = JSON.stringify(block);
    let index = this.paletteLookup.get(key);
    if (index === undefined) {
      index = this.palette.push(block) - 1;
      this.paletteLookup.set(key, index);
    }
    // Bedrock's cell order: x is the slowest axis, then y, then z.
    this.indices[(x * sizeY + y) * sizeZ + z] = index;
  }

  encode(): Uint8Array {
    const waterloggedLayer = new Int32Array(this.indices.length).fill(-1);
    const paletteEntries = this.palette.map((block) => {
      const states: Record<string, NbtValue> = {};
      for (const [name, value] of Object.entries(block.states ?? {})) {
        states[name] =
          typeof value === "string" ? string(value) : typeof value === "boolean" ? byte(value ? 1 : 0) : int(value);
      }
      return compound({ name: string(block.name), states: compound(states), version: int(BLOCK_VERSION) });
    });

    return encodeNbt(
      compound({
        format_version: int(1),
        size: intList([...this.size]),
        structure: compound({
          block_indices: list("intList", [intList(this.indices), intList(waterloggedLayer)]),
          entities: list("end", []),
          palette: compound({
            default: compound({
              block_palette: list("compound", paletteEntries),
              block_position_data: compound({}),
            }),
          }),
        }),
        structure_world_origin: intList([0, 0, 0]),
      }),
    );
  }
}
