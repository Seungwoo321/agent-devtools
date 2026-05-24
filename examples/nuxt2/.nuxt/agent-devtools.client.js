import { mountAgentDevtoolsVue2 } from '@agent-devtools/vue2';

// src/runtime/plugin.ts
function agentDevtoolsNuxt2Plugin() {
  if (typeof document === "undefined") return;
  mountAgentDevtoolsVue2();
}

export { agentDevtoolsNuxt2Plugin as default };
//# sourceMappingURL=plugin.js.map
//# sourceMappingURL=plugin.js.map