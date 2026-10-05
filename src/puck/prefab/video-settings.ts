import { defineComponentSiteSettings } from "../component-settings.js";

// Site-wide options for every Video block, set under Admin → Settings → Video.
export const videoSiteSettings = defineComponentSiteSettings({
  fields: {
    consent: {
      type: "boolean",
      label: "Ask before loading embedded videos",
      description:
        "Covers YouTube, Vimeo and other third-party videos with a notice, and loads nothing from the service until the visitor chooses to play. Video files hosted elsewhere play as normal.",
      default: false,
    },
    consentMessage: {
      type: "text",
      label: "Notice",
      description: "{service} is replaced with the video's host, e.g. YouTube.",
      default:
        "This video is hosted by {service}. Playing it loads content from {service}, which may set cookies and collect data about your visit.",
    },
    consentButton: {
      type: "text",
      label: "Button label",
      default: "Play video",
    },
    rememberConsent: {
      type: "boolean",
      label: "Offer to remember the choice",
      description: "Adds an \"Always allow {service}\" checkbox, saved in the visitor's browser.",
      default: true,
    },
  },
});

// What the Video render gets from its data resolver when the notice is on.
export type VideoConsentOptions = {
  message: string;
  button: string;
  remember: boolean;
};
