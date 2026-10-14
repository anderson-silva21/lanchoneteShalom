import { roleOptions } from '../access'

export function RoleSelector({ roles, onChange, legend, disabled = false }) {
  return (
    <fieldset disabled={disabled} className="min-w-0 rounded-xl border border-line/80 p-3 dark:border-shalom-gold/10">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {roleOptions.map(({ value, label }) => (
          <label key={value} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" name="roles" value={value} className="h-4 w-4 accent-shalom-orange"
              checked={roles.includes(value)}
              onChange={(event) => onChange(event.target.checked ? [...roles, value] : roles.filter((role) => role !== value))} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
