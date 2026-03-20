import {
  handleGeneralAgent,
  handleItAgent,
  handleMixedResearchAgent,
  handleNewsAgent,
  handleSgroupAgent,
  handleWeatherAgent
} from "./agents.mjs";
import { routeMessage } from "./router.mjs";

export async function handleChatMessage(message) {
  const route = routeMessage(message);
  let response;

  switch (route.intent) {
    case "weather":
      response = await handleWeatherAgent(route.args, route);
      break;
    case "news":
      response = await handleNewsAgent(route.args, route);
      break;
    case "it-research":
      response = await handleItAgent(route.args, route);
      break;
    case "sgroup-knowledge":
      response = await handleSgroupAgent(route.args, route);
      break;
    case "mixed-research":
      response = await handleMixedResearchAgent(route.args, route);
      break;
    default:
      response = await handleGeneralAgent(message, route);
      break;
  }

  return { route, response };
}
