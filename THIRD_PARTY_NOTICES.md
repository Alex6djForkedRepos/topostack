# Third-party notices

TopoStack itself is MIT-licensed ([LICENSE](LICENSE)). This file covers third-party code that TopoStack redistributes in compiled form, apart from the npm dependencies bundled into the web app, which keep their own licence headers. Map and elevation data sources and their attribution requirements are listed on the site's attribution page.

## Sheet nesting engine

Sheet nesting packs cut parts onto stock sheets with **sparrow**, a heuristic for 2D irregular strip packing by Jeroen Gardeyn (KU Leuven), built on **jagua-rs**, his collision-detection engine for cutting and packing. Both are compiled unmodified into the WebAssembly module `packages/nest-wasm/pkg/topostack_nest_wasm_bg.wasm` and shipped with the web app. `packages/nest-wasm/Cargo.toml` pins the exact versions. [`packages/nest-wasm/THIRD_PARTY_LICENSES.md`](packages/nest-wasm/THIRD_PARTY_LICENSES.md) holds the full licence text for every crate compiled into that module.

### sparrow

- Source: https://github.com/JeroenGar/sparrow
- Licence: MIT

```text
MIT License

Copyright (c) 2025 Jeroen Gardeyn, KU Leuven

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### jagua-rs

- Version: 0.8.3, used unmodified
- Licence: Mozilla Public License 2.0, https://mozilla.org/MPL/2.0/
- Source code for the exact version compiled in: https://crates.io/crates/jagua-rs/0.8.3 and https://github.com/JeroenGar/jagua-rs

Under MPL-2.0 §3.2, the source code of jagua-rs is available from the links above. TopoStack does not modify any jagua-rs file.

### Citing the method

If you publish work that relies on TopoStack's sheet nesting, please cite the sparrow and jagua-rs papers listed in [docs/nesting.md](docs/nesting.md).
