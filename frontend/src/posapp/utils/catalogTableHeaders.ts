/**
 * Interface representing a table header configuration.
 */
export interface TableHeader {
    title: string;
    key: string;
    align?: "start" | "center" | "end";
    sortable?: boolean;
    width?: string;
}

/**
 * Get table headers configuration for items list view.
 * @param context Context: 'pos' or 'purchase'
 * @param posProfile POS profile configuration
 * @returns Array of header configurations
 */
export function getItemsTableHeaders(context: "pos" | "purchase" | string, posProfile?: any): TableHeader[] {
    if (context === "purchase") {
        return [
            {
                title: __("Item"),
                key: "item_name",
                align: "start",
                sortable: true,
                width: "40%",
            },
            {
                title: __("Buying Price"),
                key: "rate",
                align: "end",
                sortable: true,
                width: "25%",
            },
            {
                title: __("Stock"),
                key: "actual_qty",
                align: "end",
                sortable: true,
                width: "20%",
            },
        ];
    }

    const headers: TableHeader[] = [
        {
            title: __("Name"),
            align: "start",
            sortable: true,
            key: "item_name",
        },
        {
            title: __("Code"),
            align: "start",
            sortable: true,
            key: "item_code",
        },
        { title: __("Rate"), key: "rate", align: "start" },
        { title: __("Available QTY"), key: "actual_qty", align: "start" },
        { title: __("UOM"), key: "stock_uom", align: "start" },
    ];

    // Remove item code column if configured
    if (posProfile && !posProfile.posa_display_item_code) {
        headers.splice(1, 1);
    }

    return headers;
}
