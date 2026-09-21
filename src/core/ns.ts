// The add-on's namespace comes from trailhead.config.json and is injected at build time.
// Pack JSON files write "ns:" and the build substitutes it; scripts use id().
export const NAMESPACE: string = __NAMESPACE__;

export function id(name: string): string {
  return `${NAMESPACE}:${name}`;
}
