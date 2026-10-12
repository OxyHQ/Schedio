// biome-ignore lint/correctness/noUnresolvedImports: an ambient module declaration, not an import; it is what makes these paths resolve
declare module '@/assets/images/*' {
  // Metro resolves an image require/import to its numeric asset id.
  const value: number;
  export default value;
}
