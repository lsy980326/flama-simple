import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import terser from "@rollup/plugin-terser";
import postcss from "rollup-plugin-postcss";
import { readFileSync } from "fs";

const packageJson = JSON.parse(readFileSync("./package.json", "utf-8"));

export default [
  // ESM 빌드
  {
    input: "src/lib/index.ts",
    output: {
      file: packageJson.module,
      format: "esm",
      sourcemap: true,
      exports: "named",
      inlineDynamicImports: true,
    },
    plugins: [
      peerDepsExternal(),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.lib.json",
        declaration: true,
        declarationDir: "./dist",
        rootDir: "./src/lib",
      }),
      postcss({
        extract: true,
        minimize: true,
        autoModules: true,
      }),
    ],
    external: ["react", "react-dom"],
  },
  // CJS 빌드
  {
    input: "src/lib/index.ts",
    output: {
      file: packageJson.main,
      format: "cjs",
      sourcemap: true,
      exports: "named",
      inlineDynamicImports: true,
    },
    plugins: [
      peerDepsExternal(),
      resolve({
        browser: true,
        preferBuiltins: false,
      }),
      commonjs(),
      typescript({
        tsconfig: "./tsconfig.lib.json",
        declaration: false,
      }),
      postcss({
        extract: true,
        minimize: true,
        autoModules: true,
      }),
      terser(),
    ],
    external: ["react", "react-dom"],
  },
];
