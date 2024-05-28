import {S3} from "@aws-sdk/client-s3";
const url = require('url');

const s3 = new S3({
  region: process.env.AWS_REGION,
});

module.exports = {
  requestReceived: async function(req, res, next) {
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const get = await s3.getObject({Bucket: process.env.S3_BUCKET_NAME, Key: this.getCacheKey(req)});
      const html = await get.Body.transformToString();
      const freshness = process.env.S3_CACHE_FRESHNESS || 604800000;
      const now = Date.now();
      const lastModified = new Date(get.LastModified).getTime();
      if ((now - lastModified) < freshness) {
        return res.send(200, html);
      }
    } catch (err) {
      console.error(err);
    }

    next();
  },

  pageLoaded: async function(req, res, next) {
    if(req.prerender.statusCode !== 200) {
      return next();
    }

    const s3Options = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: this.getCacheKey(req),
      ContentType: 'text/html;charset=UTF-8',
      StorageClass: 'REDUCED_REDUNDANCY',
      Body: req.prerender.content
    }

    try {
      await s3.putObject(s3Options);
    } catch (err) {
      console.error(err);
    }

    next();
  },

  getCacheKey: function(req) {
    let key = req.prerender.url;
    if (req.prerender.width) {
      key = `${key}-width-${req.prerender.width}`;
    }

    const optionsObj = url.parse(req.url, true).query;
    if ('viewerType' in optionsObj) {
      key = `${optionsObj.viewerType}/${key}`;
    }

    if (process.env.S3_PREFIX_KEY) {
      key = `${process.env.S3_PREFIX_KEY}/${key}`;
    }

    // remove any trailing slash
    key = key.replace(/\/$/, '');

    return key;
  },
};
