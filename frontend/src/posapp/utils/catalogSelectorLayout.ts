/**
 * Utility functions for responsive item card layout.
 */

/**
 * Calculates the number of columns based on container width.
 */
export const getCardColumns = (width: number): number => {
    if (width <= 768) {
        return 1;
    }
    if (width <= 1200) {
        return 2;
    }
    return 3;
};

/**
 * Calculates the gap between cards based on container width.
 */
export const getCardGap = (width: number): number => {
    if (width <= 768) {
        return 10;
    }
    if (width <= 1200) {
        return 12;
    }
    return 16;
};

/**
 * Calculates the padding for the card container based on container width.
 */
export const getCardPadding = (width: number): number => {
    if (width <= 768) {
        return 10;
    }
    if (width <= 1200) {
        return 12;
    }
    return 16;
};
