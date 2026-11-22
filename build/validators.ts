import Ajv2020 from 'ajv/dist/2020'
import formats from 'ajv-formats'
import standalone from 'ajv/dist/standalone'
import type { Plugin } from 'vite'
import { schemaFor, sections } from '../src/data/schemaDefinitions'

// Only the bundled canonical schemas are compiled. Browsers receive plain
// validation functions and can run with a CSP that forbids runtime eval.
export function validators(): Plugin {
  const id = 'virtual:planner-validators'
  return {
    name: 'planner-validators',
    resolveId(source) {
      if (source === id) return '\0' + id
    },
    load(source) {
      if (source !== '\0' + id) return
      const ajv = new Ajv2020({ strict: true, code: { source: true, esm: true } })
      formats(ajv)
      const refs = Object.fromEntries(sections.map(section => {
        const schema = schemaFor(section)
        ajv.addSchema(schema)
        return [section, schema.$id]
      }))
      // Ajv standalone emits CommonJS helper references inside its ESM output.
      // Give Vite explicit imports so it bundles the helpers as local assets.
      const imports = new Map<string, string>()
      const code = standalone(ajv, refs).replace(/require\("([^"]+)"\)(\.default)?/g, (_, path: string, defaultExport?: string) => {
        if (!imports.has(path)) imports.set(path, 'ajvHelper' + imports.size)
        const name = imports.get(path)!
        return defaultExport ? '(' + name + '.default ?? ' + name + ')' : name
      })
      return [...imports].map(([path, name]) => 'import ' + name + ' from ' + JSON.stringify(path)).join('\n') + '\n' + code
    },
  }
}
