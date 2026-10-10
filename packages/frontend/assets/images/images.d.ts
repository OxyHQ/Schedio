declare module '@/assets/images/*' {
  // Metro resolves an image require/import to its numeric asset id.
  const value: number;
  export default value;
}
