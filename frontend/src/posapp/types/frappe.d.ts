export { };

declare global {
    interface Window {
        frappe: Frappe;
        __: (str: string) => string;
    }

    const frappe: Frappe;
    const __: (str: string) => string;
}

export interface Frappe {
    call: (options: FrappeCallArgs) => Promise<any>;
    msgprint: (msg: string | object) => void;
    throw: (msg: string) => void;
    confirm: (msg: string, resolve: () => void, reject: () => void) => void;
    show_alert: (alert: { message: string; indicator: string }, seconds?: number) => void;
    datetime: {
        nowdate: () => string;
        now_datetime: () => string;
        get_today: () => string;
        add_days: (date: string, days: number) => string;
        add_months: (date: string, months: number) => string;
        month_end: () => string;
        month_start: () => string;
        get_diff: (date1: string, date2: string) => number;
    };
    utils: {
        get_url: (path: string) => string;
    };
    render_template: (template: string, context: object) => string;
}

export interface FrappeCallArgs {
    method: string;
    args?: Record<string, any>;
    callback?: (r: any) => void;
    error?: (r: any) => void;
    freeze?: boolean;
    quiet?: boolean;
    async?: boolean;
    btn?: any;
}
