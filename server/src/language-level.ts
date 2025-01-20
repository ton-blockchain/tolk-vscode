import { TolkCompilerVersion } from './config-scheme';
import { semverCompare } from "./utils/semver-compare";

// All syntax changes in Tolk language are reflected in this object.
// It's used to detect TolkLanguageCapabilities by compilerVersion and for error messages.
// TolkCompilerVersion is auto-detected (search "tolkSdk") or set by a user manually.
//
// IMPORTANT! Grammar (tree-sitter-tolk) always parses the latest version of Tolk,
// and when some syntax is unsupported due to compilerVersion, they are highlighted as error diagnostics.
export const TolkChangesByLevel = {
  booleanTypeSupported: '0.7',
  // in some future, break/continue from loops will be supported; for now, just parse, but highlight an error
  breakContinueSupported: '0.20',
}

// having compilerVersion, `detectTolkLanguageCapabilities()` fills this structure
export interface TolkLanguageCapabilities {
  booleanTypeSupported: boolean
  breakContinueSupported: boolean
}

function isGreaterOrEqual(compilerVersion: TolkCompilerVersion, rhs: TolkCompilerVersion) {
  return semverCompare(compilerVersion, rhs) >= 0
}

let cachedCapabilities: { [level in TolkCompilerVersion]: TolkLanguageCapabilities } = {}

export function detectTolkLanguageCapabilities(compilerVersion: TolkCompilerVersion): TolkLanguageCapabilities {
  if (compilerVersion in cachedCapabilities) {
    return cachedCapabilities[compilerVersion]
  }

  // for v0.6 (initial released version)
  let c: TolkLanguageCapabilities = {
    booleanTypeSupported: false,
    breakContinueSupported: false,
  }
  if (isGreaterOrEqual(compilerVersion, TolkChangesByLevel.booleanTypeSupported)) {
    c.booleanTypeSupported = true
  }
  if (isGreaterOrEqual(compilerVersion, TolkChangesByLevel.breakContinueSupported)) {
    c.breakContinueSupported = true
  }

  cachedCapabilities[compilerVersion] = c
  return c
}
