import fs from "fs";
import { rollup, watch, RollupOptions, OutputOptions, Plugin } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import { jsxInclude, jsxBin, jsxPonyfill } from "vite-cep-plugin";
import { CEP_Config } from "vite-cep-plugin";
import json from "@rollup/plugin-json";
import path from "path";

const GLOBAL_THIS = "thisObj";

// Plugin to remove "use strict" from output (ExtendScript doesn't support it)
function removeUseStrict(): Plugin {
  return {
    name: "remove-use-strict",
    generateBundle(options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName];
        if (chunk.type === "chunk") {
          chunk.code = chunk.code.replace(/"use strict";?/g, "");
        }
      }
    },
  };
}

// Plugin to remove ES6+ artifacts that ExtendScript (ES3) cannot parse
// Babel outputs __proto__: null in module namespace objects which is invalid ES3
function removeES6Artifacts(): Plugin {
  return {
    name: "remove-es6-artifacts",
    generateBundle(options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName];
        if (chunk.type === "chunk") {
          // Remove __proto__: null from object literals (Babel namespace output)
          chunk.code = chunk.code.replace(/__proto__:\s*null,?\s*/g, "");
          // Remove /*#__PURE__*/ comments that may confuse ExtendScript
          chunk.code = chunk.code.replace(/\/\*#__PURE__\*\//g, "");
          // Fix inline comments that don't have newlines - vite-cep-plugin sometimes
          // concatenates code after // comments on the same line
          // Pattern 1: // ---------------------------------- // followed immediately by code
          chunk.code = chunk.code.replace(/(\/\/ -{30,} \/\/)([^\n])/g, "$1\n$2");
          // Normalize line endings: convert all \r to \n, remove \r\n dupes
          chunk.code = chunk.code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          // Pattern 2: // ----- EXTENDSCRIPT PONYFILLS ----- followed by function/var
          chunk.code = chunk.code.replace(/(PONYFILLS\s+-+\n*)(function|var)/g, "$1\n$2");
        }
      }
    },
  };
}

export const extendscriptConfig = (
  extendscriptEntry: string,
  outPath: string,
  cepConfig: CEP_Config,
  extensions: string[],
  isProduction: boolean,
  isPackage: boolean,
) => {
  console.log(outPath);
  const config: RollupOptions = {
    input: extendscriptEntry,
    treeshake: true,
    output: {
      file: outPath,
      sourcemap: isPackage
        ? cepConfig.zxp.sourceMap
        : cepConfig.build?.sourceMap,
    },
    plugins: [
      json(),
      nodeResolve({
        extensions,
      }),
      babel({
        extensions,
        exclude: /node_modules/,
        babelrc: false,
        babelHelpers: "inline",
        presets: ["@babel/preset-env", "@babel/preset-typescript"],
        plugins: [
          "@babel/plugin-syntax-dynamic-import",
          "@babel/plugin-proposal-class-properties",
        ],
      }),
      jsxPonyfill(),
      jsxInclude({
        iife: true,
        globalThis: GLOBAL_THIS,
      }),
      jsxBin(isPackage ? cepConfig.zxp.jsxBin : cepConfig.build?.jsxBin),
      removeUseStrict(),
      removeES6Artifacts(),
    ],
  };

  async function build() {
    const bundle = await rollup(config);
    await bundle.write(config.output as OutputOptions);
    await bundle.close();
  }

  const triggerHMR = () => {
    // No built-in way to trigger Vite's HMR reload from outside the root folder
    // Workaround will read and save index.html file for each panel to triggger reload
    console.log("ExtendScript Change");
    cepConfig.panels.map((panel) => {
      const tmpPath = path.join(process.cwd(), "src", "js", panel.mainPath);
      if (fs.existsSync(tmpPath)) {
        const txt = fs.readFileSync(tmpPath, { encoding: "utf-8" });
        fs.writeFileSync(tmpPath, txt, { encoding: "utf-8" });
      }
    });
  };

  const watchRollup = async () => {
    const watcher = watch(config);
    watcher.on("event", ({ result }: any) => {
      if (result) {
        triggerHMR();
        result.close();
      }
    });
    watcher.close();
  };

  if (isProduction) {
    build();
  } else {
    watchRollup();
  }
};
