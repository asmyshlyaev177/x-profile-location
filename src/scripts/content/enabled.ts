// The master switch. Off strips what is already on screen rather than only
// skipping new work, so almost every entry point asks it before doing anything.

import { EXTENSION_ENABLED_KEY } from '../constants'
import { defaultSetting } from '../settings'

let enabled = defaultSetting(EXTENSION_ENABLED_KEY)

export function isEnabled(): boolean {
  return enabled
}

export function setEnabled(value: boolean): void {
  enabled = value
}

export function __resetEnabled(): void {
  enabled = defaultSetting(EXTENSION_ENABLED_KEY)
}
