const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY;
const MAILCHIMP_AUDIENCE_ID = process.env.MAILCHIMP_AUDIENCE_ID;
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER || 'us12';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

async function mailchimpRequest(endpoint, method, body) {
  const url = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0${endpoint}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `apikey ${MAILCHIMP_API_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

const crypto = require('crypto');

// MD5 hash for Mailchimp subscriber lookup
function md5(str) {
  return crypto.createHash('md5').update(str.toLowerCase()).digest('hex');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!MAILCHIMP_API_KEY || !MAILCHIMP_AUDIENCE_ID) {
    console.error('Mailchimp not configured');
    return { statusCode: 200, headers, body: JSON.stringify({ status: 'skipped', reason: 'not configured' }) };
  }

  try {
    const { action, email, firstName, lastName, tags, mergeFields } = JSON.parse(event.body);
    const subscriberHash = md5(email);
    const listEndpoint = `/lists/${MAILCHIMP_AUDIENCE_ID}`;

    if (action === 'register') {
      // Add or update subscriber on registration
      const result = await mailchimpRequest(
        `${listEndpoint}/members/${subscriberHash}`,
        'PUT',
        {
          email_address: email,
          status_if_new: 'subscribed',
          status: 'subscribed',
          merge_fields: {
            FNAME: firstName || '',
            LNAME: lastName || '',
            ...mergeFields
          },
          tags: ['learner', 'registered', 'incomplete']
        }
      );

      // Tags need to be set separately via the tags endpoint
      await mailchimpRequest(
        `${listEndpoint}/members/${subscriberHash}/tags`,
        'POST',
        {
          tags: [
            { name: 'learner', status: 'active' },
            { name: 'registered', status: 'active' },
            { name: 'incomplete', status: 'active' },
            { name: 'predictive-model-learning', status: 'active' }
          ]
        }
      );

      return { statusCode: 200, headers, body: JSON.stringify({ status: 'registered', id: result.data.id }) };

    } else if (action === 'progress') {
      // Update progress tags
      const progressTags = [
        { name: 'incomplete', status: 'active' }
      ];

      // Add progress tag
      if (tags && tags.length > 0) {
        tags.forEach(tag => {
          progressTags.push({ name: tag, status: 'active' });
        });
      }

      await mailchimpRequest(
        `${listEndpoint}/members/${subscriberHash}/tags`,
        'POST',
        { tags: progressTags }
      );

      // Update merge field with progress count if provided
      if (mergeFields) {
        await mailchimpRequest(
          `${listEndpoint}/members/${subscriberHash}`,
          'PATCH',
          { merge_fields: mergeFields }
        );
      }

      return { statusCode: 200, headers, body: JSON.stringify({ status: 'progress_updated' }) };

    } else if (action === 'qualified') {
      // Mark as qualified — remove incomplete, add qualified
      await mailchimpRequest(
        `${listEndpoint}/members/${subscriberHash}/tags`,
        'POST',
        {
          tags: [
            { name: 'incomplete', status: 'inactive' },
            { name: 'qualified', status: 'active' },
            { name: 'completed-all-modules', status: 'active' }
          ]
        }
      );

      // Update merge field
      await mailchimpRequest(
        `${listEndpoint}/members/${subscriberHash}`,
        'PATCH',
        {
          merge_fields: {
            PROGRESS: '12/12',
            QUALIFIED: 'Yes',
            ...mergeFields
          }
        }
      );

      return { statusCode: 200, headers, body: JSON.stringify({ status: 'qualified' }) };

    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    }

  } catch (err) {
    console.error('Mailchimp function error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error' }) };
  }
};
