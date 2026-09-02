import { eslintCompatPlugin } from "@oxlint/plugins";

import noSingleUsePrivateFunctionsRule from "./rules/no-single-use-private-functions.ts";
import privateFunctionPrefixRule from "./rules/private-function-prefix.ts";

/** Core TypeScript Oxlint rules that keep private module helpers honest. */
const corePlugin = eslintCompatPlugin({
  meta: { name: "core" },
  rules: {
    "no-single-use-private-functions": noSingleUsePrivateFunctionsRule,
    "private-function-prefix": privateFunctionPrefixRule,
  },
});

export default corePlugin;
