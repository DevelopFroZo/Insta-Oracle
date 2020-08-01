"use strict";

// Server
process.env.SELF_URL = "http://0.0.0.0:3000";
process.env.BIND_URI = "/bind";
process.env.CACHE_LIFETIME = 10 * 60;
process.env.ACTIVITY_RESEND = "/activity/resend";
process.env.DEFAULT_PORT = 3000;
process.env.NODE_ENV = "development";

// Cron
process.env.CRON_UPDATE_DELAY = 1; // Seconds
process.env.CRON_UPDATE_LIMIT = 5;
process.env.CRON_SCRAP_PERIOD_SUCCESS = 20/*24 * 60 * 60*/; // Seconds
process.env.CRON_SCRAP_PERIOD_ERROR = 20/*60 * 60*/; // Seconds
process.env.CRON_CLEAR_CACHE_PERIOD = 24 * 60 * 60; // Seconds
process.env.CRON_UPDATE_STATUS_PERIOD = 30/*60 * 60*/; // Seconds

// ODS
process.env.ORACLE_NAME = "oracle_insta";
process.env.ORACLE_ID = 4;

process.env.HMAC_ALGORITHM = "sha256";
process.env.HMAC_SECRET = ""; // oracle_secret
process.env.HMAC_SIGNATURE_ENCODING = "hex";

process.env.DEFAULT_SUCCESS_URI = "https://oracle.iterra.world/bind/success";
process.env.DEFAULT_FAILURE_URI = "https://oracle.iterra.world/bind/failure";
process.env.ODS_URL = "https://dev.oracle.iterra.world";
process.env.UNBIND_URI = "/api/v1/oracle/{ORACLE_ID}/bind";
process.env.SEND_ACTIVITIES_URI = "/api/v1/oracle/{ORACLE_ID}/activities";

// Instagram
process.env.INST_AUTHORIZE_URL = "https://api.instagram.com/oauth/authorize";
process.env.INST_REDIRECT_URI = "https://oraculinsta.space/inst/auth";
process.env.INST_APP_ID = "";
process.env.INST_SECRET = "";
