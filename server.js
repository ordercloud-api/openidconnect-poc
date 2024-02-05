const express = require("express");
const app = express();
const port = process.env.PORT || 4451;
const parseJwt = require("jwt-decode");
const OrderCloud = require("ordercloud-javascript-sdk");
const { stringReplace } = require("string-replace-middleware");

/*********************************************************************************
*  Please ensure all settings are defined and match values for your marketplace  *
**********************************************************************************/
const ORDERCLOUD_CLIENT_ID = process.env.ORDERCLOUD_CLIENT_ID || "";
const ORDERCLOUD_OPEN_ID_CONNECT_ID = process.env.ORDERCLOUD_OPEN_ID_CONNECT_ID || "google";
const ORDERCLOUD_BASE_API_URL = process.env.ORDERCLOUD_BASE_API_URL || "https://sandboxapi.ordercloud.io"
const ORDERCLOUD_BUYER_ID = process.env.ORDERCLOUD_BUYER_ID || "buyer1";
const ORDERCLOUD_ROLES = process.env.ORDERCLOUD_ROLES || 'Shopper'; // space separated list of roles
/************************************************************************************** */

OrderCloud.Configuration.Set({
  baseApiUrl: ORDERCLOUD_BASE_API_URL,
});
const { v4: uuidv4 } = require("uuid");

app.use(express.json());

// This endpoint will be called after a user has successfully logged in via their IDP but before they are redirected to the application
// It is responsible for associating a user from the idp with a user from ordercloud and expects a username be returned
app.post("/integration-events/createuser", (req, res) => {
  const body = req.body;
  console.log(`Ordercloud access token`, body.OrderCloudAccessToken);
  OrderCloud.Tokens.SetAccessToken(body.OrderCloudAccessToken);

  // The claims (user details) from parsing the idp's ID token
  const claims = parseJwt(body.TokenResponse.id_token);
  console.log(`User claims decoded from the IDP's ID token`, claims);

  // We get an access token from the IDP which can be used to call out to the idp's api
  // in google's case we could pass along additional claims and upload something using google drive api for example
  console.log(`IDP access token`, body.TokenResponse.access_token);

  // Here we're creating a new user and associating that new user with the idp login
  const newUser = {
    Username: uuidv4(), // can be something else but you're responsible for ensuring uniqueness across seller org
    Email: claims.email || "NOT_AVAILABLE",
    FirstName: claims.given_name || "NOT_AVAILABLE",
    LastName: claims.family_name || "NOT_AVAILABLE",
    Active: true,
  };

  console.log(`new user to create in buyerID ${ORDERCLOUD_BUYER_ID} \n ${JSON.stringify(newUser, null, 4)} `)

  // You can imagine doing something else here like assigning the user to a relevant group based on
  // the claims from the IDP - your imagination is the limit
  return (
    OrderCloud.Users.Create(ORDERCLOUD_BUYER_ID, newUser)

      // OrderCloud expects the username of a user
      // here we are creating a brand new user but we could have just as easily returned
      // the username of an existing user
      .then((user) => {
        console.log(`Success! Created user with username ${user.Username}`);
        return res
          .status(200)
          .send({ ErrorMessage: null, Username: newUser.Username });
      })
      .catch((error) => {
        const message = error.isOrderCloudError
          ? JSON.stringify(error.errors)
          : error.message;

        // We can tell the API to display errors to the user, helpful for debugging
        // any unhandled exceptions will be displayed as a raw value
        console.log(`An error occurred while creating the user`);
        console.log(message);
        return res.status(200).send({ ErrorMessage: message, Username: null });
      })
  );
});

// this endpoint gets called by the OrderCloud API whenever a user needs to get a new ordercloud token via openidconnect AFTER the first attempt
// it is responsible for updating user details in ordercloud when they have changed in the idp
app.post("/integration-events/syncuser", (req, res) => {
  const body = req.body;
  OrderCloud.Tokens.SetAccessToken(body.OrderCloudAccessToken);

  // The ordercloud user associated with this IDP
  const existingUser = body.ExistingUser;

  console.log('existingUser', existingUser)

  // The claims (user details) from parsing the idp's ID token
  const claims = parseJwt(body.TokenResponse.id_token);
  console.log('claims', claims);

  const shouldSyncUser =
    (existingUser.Email !== claims.email &&
      existingUser.Email !== "NOT_AVAILABLE") ||
    (existingUser.FirstName !== claims.given_name &&
      existingUser.FirstName !== "NOT_AVAILABLE") ||
    (existingUser.LastName !== claims.family_name &&
      existingUser.LastName !== "NOT_AVAILABLE");

  if (!shouldSyncUser) {
    console.log('Not syncing user as no changes detected')
    console.log('Username: ', existingUser.Username)
    res
      .status(200)
      .send({ ErrorMessage: null, Username: existingUser.Username });
    return;
  }

  console.log('Syncing user, changes detected')

  OrderCloud.Users.Patch(existinguser.CompanyID, existingUser.ID, {
    Email: claims.Email || "NOT_AVAILABLE",
    FirstName: claims.given_name || "NOT_AVAILABLE",
    LastName: claims.family_name || "NOT_AVAILABLE",
  })
    .then((user) => {
      console.log('Success! Updated user with username: ', user.Username)
      return res
        .status(200)
        .send({ ErrorMessage: null, Username: user.Username });
    })
    .catch((error) => {
      console.log(`An error occurred while syncing the user`);
      const message = error.isOrderCloudError
        ? JSON.stringify(error.errors)
        : error.message;
      console.log(message);
      return res.status(200).send({ ErrorMessage: message, Username: null });
    });
});

// disable browser caching https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

// disable browser caching https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag
app.set('etag', false)

// Inject variables into index.html before serving to client
app.use(stringReplace({
  ORDERCLOUD_CLIENT_ID,
  ORDERCLOUD_OPEN_ID_CONNECT_ID,
  ORDERCLOUD_BASE_API_URL,
  ORDERCLOUD_BUYER_ID
}))

app.use("/", express.static(__dirname));
app.listen(port, () =>
  console.log(`Listening on port ${port} - http://localhost:${port}`)
);
