import terser from '@rollup/plugin-terser'
import typescript from '@rollup/plugin-typescript'

export default {
    input: [
        'src/index.ts',
    ],
    output: [
        {
            format: 'es',
            preserveModules: true,
            dir: 'dist',
            entryFileNames: '[name].js',
            banner: '#!/usr/bin/env node',
        },
    ],
    plugins: [
        typescript({
            sourceMap: false,
            filterRoot: 'src',
            outDir: 'dist',
            exclude: ["**/*.test.ts"]
        }),
        terser(),
    ],
    external: [
        "fs",
        "path",
        "degit",
        "chalk",
        "cross-spawn",
        "prompts",
    ]
}
