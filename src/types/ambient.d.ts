// Ambient type shims for optional deps and Node globals while dependencies are being installed.
declare module 'fastify' {
  export type FastifyInstance = any;
  export type FastifyRequest = any;
  export type FastifyReply = any;
  const fastify: any;
  export default fastify;
}
declare module '@fastify/multipart' { const mod: any; export default mod; }
declare module '@fastify/cors' { const mod: any; export default mod; }
declare module '@fastify/helmet' { const mod: any; export default mod; }
declare module '@fastify/under-pressure' { const mod: any; export default mod; }
declare module '@fastify/swagger' { const mod: any; export default mod; }
declare module '@fastify/swagger-ui' { const mod: any; export default mod; }
declare module '@vladmandic/face-api' { const mod: any; export default mod; export const env: any; export const nets: any; export const TinyFaceDetectorOptions: any; }
declare module '@tensorflow/tfjs-node' { const mod: any; export default mod; export const node: any; }
declare module 'tesseract.js' { const mod: any; export default mod; }
declare module 'opencv4nodejs' { const mod: any; export default mod; }

declare const process: any;