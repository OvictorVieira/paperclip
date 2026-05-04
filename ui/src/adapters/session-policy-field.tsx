import type { AdapterConfigFieldsProps } from "./types";
import { Field } from "../components/agent-config-primitives";

const selectClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm";

type SessionPolicyFieldProps = Pick<
  AdapterConfigFieldsProps,
  "isCreate" | "values" | "set" | "config" | "eff" | "mark"
>;

export function SessionPolicyField({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: SessionPolicyFieldProps) {
  const value = isCreate
    ? String(values!.sessionPolicy ?? "resume")
    : eff("adapterConfig", "sessionPolicy", String(config.sessionPolicy ?? "resume"));

  const commit = (next: string) => {
    const normalized = next === "fresh" || next === "summarized" ? next : undefined;
    if (isCreate) {
      set!({ sessionPolicy: normalized });
    } else {
      mark("adapterConfig", "sessionPolicy", normalized);
    }
  };

  return (
    <Field
      label="Session policy"
      hint="Controls whether Paperclip resumes native adapter sessions between heartbeats. Use summarized to start fresh while reading a short workspace handoff."
    >
      <select
        className={selectClass}
        value={value}
        onChange={(event) => commit(event.target.value)}
      >
        <option value="resume">resume</option>
        <option value="fresh">fresh</option>
        <option value="summarized">summarized</option>
      </select>
    </Field>
  );
}
