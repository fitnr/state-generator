/* jshint esversion: 6 */

import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';

export default {
    plugins: [
        nodeResolve({ jsnext: true }),
        commonjs(),
        babel(),
    ]
};
