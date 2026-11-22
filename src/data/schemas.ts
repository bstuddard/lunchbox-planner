import * as validators from 'virtual:planner-validators'
import type { Section } from '../domain/model'
export { schemaFor, sections } from './schemaDefinitions'

export function validatePayload(section: Section, data: unknown) {
  const check = validators[section]
  if (!check(data)) {
    const e = check.errors![0]
    throw new Error(
      'data' +
        e.instancePath +
        ' ' +
        e.message +
        ' ' +
        JSON.stringify(e.params),
    )
  }
}
