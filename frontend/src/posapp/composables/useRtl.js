import { ref, computed, onMounted } from 'vue';
import { useDisplay } from 'vuetify';

/**
 * Composable for RTL (Right-to-Left) support in Vue components
 * Provides reactive RTL state and computed styles for proper layout
 * Integrates with Frappe's built-in RTL detection system
 */
export function useRtl() {
    const { name: breakpointName } = useDisplay();

    // Reactive RTL state
    const isRtl = ref(false);

    // Initialize RTL state from Frappe utils and document
    onMounted(() => {
        // Primary: Use Frappe's RTL detection (respects user language settings)
        if (typeof frappe !== 'undefined' && frappe.utils && typeof frappe.utils.is_rtl === 'function') {
            isRtl.value = frappe.utils.is_rtl();
        }

        // Fallback: Check document/HTML direction attribute
        if (!isRtl.value) {
            const htmlDir = document.documentElement.dir || document.body.dir || '';
            isRtl.value = htmlDir.toLowerCase() === 'rtl';
        }

        // Additional check: Look for RTL language codes in document lang
        if (!isRtl.value) {
            const docLang = document.documentElement.lang || '';
            const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ku', 'dv'];
            isRtl.value = rtlLanguages.some(lang => docLang.toLowerCase().startsWith(lang));
        }
    });

    // Computed styles for RTL-aware layouts
    const rtlStyles = computed(() => ({
        direction: isRtl.value ? 'rtl' : 'ltr',
        textAlign: isRtl.value ? 'right' : 'left'
    }));

    // Helper functions for RTL-aware spacing
    const getMarginStyle = (left = 0, right = 0, top = 0, bottom = 0) => {
        if (isRtl.value) {
            return {
                marginLeft: `${right}px`,
                marginRight: `${left}px`,
                marginTop: `${top}px`,
                marginBottom: `${bottom}px`
            };
        }
        return {
            marginLeft: `${left}px`,
            marginRight: `${right}px`,
            marginTop: `${top}px`,
            marginBottom: `${bottom}px`
        };
    };

    const getPaddingStyle = (left = 0, right = 0, top = 0, bottom = 0) => {
        if (isRtl.value) {
            return {
                paddingLeft: `${right}px`,
                paddingRight: `${left}px`,
                paddingTop: `${top}px`,
                paddingBottom: `${bottom}px`
            };
        }
        return {
            paddingLeft: `${left}px`,
            paddingRight: `${right}px`,
            paddingTop: `${top}px`,
            paddingBottom: `${bottom}px`
        };
    };

    // Helper for RTL-aware positioning
    const getPositionStyle = (left = null, right = null, top = null, bottom = null) => {
        const style = {};

        if (left !== null && right !== null) {
            if (isRtl.value) {
                style.left = `${right}px`;
                style.right = `${left}px`;
            } else {
                style.left = `${left}px`;
                style.right = `${right}px`;
            }
        } else if (left !== null) {
            style[isRtl.value ? 'right' : 'left'] = `${left}px`;
        } else if (right !== null) {
            style[isRtl.value ? 'left' : 'right'] = `${right}px`;
        }

        if (top !== null) style.top = `${top}px`;
        if (bottom !== null) style.bottom = `${bottom}px`;

        return style;
    };

    // Helper for RTL-aware flex direction
    const getFlexDirection = (direction = 'row') => {
        if (isRtl.value && direction === 'row') {
            return 'row-reverse';
        }
        if (isRtl.value && direction === 'row-reverse') {
            return 'row';
        }
        return direction;
    };

    // Helper for RTL-aware text alignment
    const getTextAlign = (align = 'left') => {
        if (isRtl.value) {
            if (align === 'left') return 'right';
            if (align === 'right') return 'left';
        }
        return align;
    };

    // Helper for RTL-aware float
    const getFloat = (float = 'left') => {
        if (isRtl.value) {
            if (float === 'left') return 'right';
            if (float === 'right') return 'left';
        }
        return float;
    };

    // Helper for RTL-aware transform
    const getTransform = (translateX = 0, translateY = 0, others = '') => {
        const x = isRtl.value ? -translateX : translateX;
        return `translateX(${x}px) translateY(${translateY}px) ${others}`.trim();
    };

    // Computed CSS classes for RTL
    const rtlClasses = computed(() => ({
        'rtl-layout': isRtl.value,
        'ltr-layout': !isRtl.value
    }));

    // Computed responsive RTL styles combining breakpoint and RTL awareness
    const responsiveRtlStyles = computed(() => {
        const baseStyles = rtlStyles.value;

        // Add responsive considerations
        const isMobile = ['xs', 'sm'].includes(breakpointName.value);

        return {
            ...baseStyles,
            // Adjust text alignment for mobile RTL
            ...(isMobile && isRtl.value && {
                textAlign: 'right'
            })
        };
    });

    return {
        // Reactive state
        isRtl,

        // Computed styles
        rtlStyles,
        rtlClasses,
        responsiveRtlStyles,

        // Helper functions
        getMarginStyle,
        getPaddingStyle,
        getPositionStyle,
        getFlexDirection,
        getTextAlign,
        getFloat,
        getTransform
    };
}

// Export default for easy importing
export default useRtl;
