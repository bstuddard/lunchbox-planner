declare module 'virtual:planner-validators' {
  type Check = import('ajv').ValidateFunction
  export const backup: Check, catalog: Check, children: Check, inventory: Check,
    packing: Check, preferences: Check, schedules: Check
}
