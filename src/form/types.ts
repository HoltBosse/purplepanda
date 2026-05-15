import * as z from "zod";

export interface BaseFieldProps {
    id: string;
    name: string;
    type: string;
    label?: string;
    required?: boolean;
    value?: string;
    description?: string;
    validator?: z.ZodTypeAny;
    groupFields?: FieldConfig[];
}

export type FieldConfig = BaseFieldProps & Record<string, any>;

export interface FormSection {
    id: string;
    title: string;
    props?: FormProps;
    classList?: string;
    fields: FieldConfig[];
}

export enum FormMethod {
    GET = 'GET',
    POST = 'POST',
}

export enum FormEncType {
    URLENCODED = 'application/x-www-form-urlencoded',
    MULTIPART = 'multipart/form-data',
    PLAIN = 'text/plain',
}

export interface FormProps {
    action: string;
    method?: FormMethod;
    encType?: FormEncType;
}
