import type { BaseFieldProps, FieldConfig, FormSection } from './types';

type FieldModule = {
  default: (props: BaseFieldProps) => any;
};

const rawFields = import.meta.glob<FieldModule>('./fields/*.astro', { eager: true });

export function getAllFields(): Record<string, FieldModule['default']> {
  return Object.fromEntries(
    Object.entries(rawFields).map(([path, mod]) => [
      path.replace('./fields/', '').replace('.astro', ''),
      mod.default,
    ])
  );
}

export function formDataToRecord(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].flatMap(([k, v]) => typeof v === 'string' ? [[k, v]] : [])
  );
}

export function validateForm(
  form: FormSection,
  data: FormData | Record<string, string>
): { success: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  function getValue(name: string): string | undefined {
    if (data instanceof FormData) {
      return data.get(name)?.toString() || undefined;
    }
    return data[name] || undefined;
  }

  function processFields(fields: FieldConfig[]): void {
    for (const field of fields) {
      if (field.groupFields) {
        processFields(field.groupFields);
      }
      if (field.validator) {
        const result = field.validator.safeParse(getValue(field.name));
        if (result.success) {
          field.value = result.data as string;
        } else {
          errors[field.name] = result.error.issues[0]?.message ?? 'Invalid value';
        }
      }
    }
  }

  processFields(form.fields);

  return { success: Object.keys(errors).length === 0, errors };
}

export function getFieldByName(form: FormSection, name: string): FieldConfig | null {
  function search(fields: FieldConfig[]): FieldConfig | null {
    for (const field of fields) {
      if (field.name === name) return field;
      if (field.groupFields) {
        const found = search(field.groupFields);
        if (found) return found;
      }
    }
    return null;
  }

  return search(form.fields);
}

export function createUserAlertMessageFromArray(form: FormSection, errors: Record<string, string>): string {
  return Object.entries(errors)
    .map(([name, error]) => {
      const label = getFieldByName(form, name)?.label ?? name;
      return `${label}: ${error}`;
    })
    .join('\n');
}