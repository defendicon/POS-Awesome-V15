/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

import "vue";

declare module "vue" {
  interface ComponentCustomProperties {
    __: (key: string, ...args: any[]) => string;
    $: JQueryStatic;
  }
}

declare global {
  interface Window {
    frappe: Frappe;
    __: (key: string, ...args: any[]) => string;
    format_currency: (value: number, currency?: string) => string;
    flt: (value: any, precision?: number) => number;
    get_currency_symbol: (currency: string) => string;
    $: JQueryStatic;
  }

  interface Frappe {
    PosApp?: { posapp?: new (pageRef: any) => any };
    provide: (name: string) => void;
    set_route: (route: string) => void;
    _: (text: string) => string;
    msgprint: (msg: any, title?: string) => void;
    call: {
      (opts: any): Promise<any>;
      (method: string, args?: any): Promise<any>;
    };
    xcall: (method: string, args?: any) => Promise<any>;
    ui: {
      set_theme: (name: string) => void;
      Dialog: new (opts: any) => any;
    };
    datetime: {
      nowdate: () => string;
      obj_to_str: (date: any) => string;
      get_today: () => string;
    };
    defaults: {
      get_default: (key: string) => any;
    };
    session: {
      user: string;
    };
    utils?: { is_rtl: () => boolean };
    realtime: {
      on: (event: string, callback: (...args: any[]) => void) => void;
      off: (event: string, callback?: (...args: any[]) => void) => void;
      socket?: { readyState: number };
    };
  }

  var frappe: Frappe;
  function __(text: string, ...args: any[]): string;
  var $: JQueryStatic;
}

export {};
