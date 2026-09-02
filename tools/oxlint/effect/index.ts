import { eslintCompatPlugin } from "@oxlint/plugins";

import noAmbientNondeterminismRule from "./rules/no-ambient-nondeterminism.ts";
import noCascadingLayerProvideRule from "./rules/no-cascading-layer-provide.ts";
import noDirectBrowserStorageRule from "./rules/no-direct-browser-storage.ts";
import noDirectFetchRule from "./rules/no-direct-fetch.ts";
import noDisableValidationRule from "./rules/no-disable-validation.ts";
import noEffectAsvoidRule from "./rules/no-effect-asvoid.ts";
import noGlobalJsonRule from "./rules/no-global-json.ts";
import noInOperatorRule from "./rules/no-in-operator.ts";
import noNestedEffectArrayMethodsRule from "./rules/no-nested-effect-array-methods.ts";
import noNestedLayerProvideRule from "./rules/no-nested-layer-provide.ts";
import noServiceOptionRule from "./rules/no-service-option.ts";
import noShadowedStandardArrayStaticRule from "./rules/no-shadowed-standard-array-static.ts";
import noSilentErrorSwallowRule from "./rules/no-silent-error-swallow.ts";
import noStaticEffectServiceForwardersRule from "./rules/no-static-effect-service-forwarders.ts";
import noSwitchRule from "./rules/no-switch.ts";
import noTryCatchRule from "./rules/no-try-catch.ts";
import noTypeofObjectRule from "./rules/no-typeof-object.ts";
import pipeMaxArgumentsRule from "./rules/pipe-max-arguments.ts";
import preferEffectMatchRule from "./rules/prefer-effect-match.ts";
import preferOptionFromNullableRule from "./rules/prefer-option-from-nullable.ts";
import requireContextServiceInServicesRule from "./rules/require-context-service-in-services.ts";

/** Effect-specific Oxlint rules that enforce Effect-first capabilities, layers, and error handling. */
const effectPlugin = eslintCompatPlugin({
  meta: { name: "effect" },
  rules: {
    "no-ambient-nondeterminism": noAmbientNondeterminismRule,
    "no-cascading-layer-provide": noCascadingLayerProvideRule,
    "no-direct-browser-storage": noDirectBrowserStorageRule,
    "no-direct-fetch": noDirectFetchRule,
    "no-disable-validation": noDisableValidationRule,
    "no-effect-asvoid": noEffectAsvoidRule,
    "no-global-json": noGlobalJsonRule,
    "no-in-operator": noInOperatorRule,
    "no-nested-effect-array-methods": noNestedEffectArrayMethodsRule,
    "no-nested-layer-provide": noNestedLayerProvideRule,
    "no-service-option": noServiceOptionRule,
    "no-shadowed-standard-array-static": noShadowedStandardArrayStaticRule,
    "no-silent-error-swallow": noSilentErrorSwallowRule,
    "no-static-effect-service-forwarders": noStaticEffectServiceForwardersRule,
    "no-switch": noSwitchRule,
    "no-try-catch": noTryCatchRule,
    "no-typeof-object": noTypeofObjectRule,
    "pipe-max-arguments": pipeMaxArgumentsRule,
    "prefer-effect-match": preferEffectMatchRule,
    "prefer-option-from-nullable": preferOptionFromNullableRule,
    "require-context-service-in-services": requireContextServiceInServicesRule,
  },
});

export default effectPlugin;
