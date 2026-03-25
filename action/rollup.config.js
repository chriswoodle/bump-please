// See: https://rollupjs.org/introduction/

import { readFileSync } from 'fs'
import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'
import typescript from '@rollup/plugin-typescript'

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))

const config = {
    input: 'src/index.ts',
    output: {
        esModule: true,
        file: 'dist/index.js',
        format: 'es',
        sourcemap: true
    },
    plugins: [
        replace({
            preventAssignment: true,
            values: {
                '__ACTION_VERSION__': pkg.version
            }
        }),
        typescript(),
        nodeResolve({ preferBuiltins: true }),
        commonjs()
    ]
}

export default config
