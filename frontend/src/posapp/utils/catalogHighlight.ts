/**
 * Utility functions for item selection highlighting and keyboard navigation.
 */

/**
 * Finds the index of an item in the list by its code.
 */
export const findItemIndexByCode = (items: any[], code: string | null | undefined): number => {
    if (!Array.isArray(items) || !code) {
        return -1;
    }
    return items.findIndex((item) => item && item.item_code === code);
};

/**
 * Interface for navigation parameters.
 */
export interface NavigationParams {
    currentIndex: number;
    itemsLength: number;
    direction: number;
}

/**
 * Calculates the next index to highlight during keyboard navigation.
 */
export const getNextHighlightedIndex = ({ currentIndex, itemsLength, direction }: NavigationParams): number => {
    if (!itemsLength || itemsLength <= 0) {
        return -1;
    }

    if (currentIndex < 0) {
        return direction > 0 ? 0 : itemsLength - 1;
    }

    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
        nextIndex = 0;
    }
    if (nextIndex >= itemsLength) {
        nextIndex = itemsLength - 1;
    }
    return nextIndex;
};
