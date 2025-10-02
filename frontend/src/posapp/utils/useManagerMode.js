import { ref } from 'vue'

// Shared reactive state
export const isManagerMode = ref(false)
export const isSessionUserManager = ref(false)

// Initialize
export function initManagerMode() {
  if (Array.isArray(frappe.user_roles) && frappe.user_roles.includes("Counter Manager")) {
    isManagerMode.value = true
    isSessionUserManager.value = true
  }
  else {
    isManagerMode.value = false
    isSessionUserManager.value = false
  }
}

// Expose setter
export function setManagerMode(value) {
  isManagerMode.value = value
}