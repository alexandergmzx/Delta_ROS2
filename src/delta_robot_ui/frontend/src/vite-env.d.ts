/// <reference types="vite/client" />

declare module '*.yaml' {
  const content: unknown;
  export default content;
}
