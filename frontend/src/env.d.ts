/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  frappe: any;
  __: (key: string, ...args: any[]) => string;
  format_currency: (value: number, currency?: string) => string;
  flt: (value: any, precision?: number) => number;
  get_currency_symbol: (currency: string) => string;
}

declare const frappe: any;
declare const __: (key: string, ...args: any[]) => string;
declare const $: any;
