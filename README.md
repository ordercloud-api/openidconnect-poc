# OpenID Connect with OrderCloud & Google

This proof of concept shows you how you can use OrderCloud's OpenID Connect feature to log in with google and get a valid OrderCloud token. The code sample here is written in javascript for simplicity. 

1. First, create a new marketplace. Take special note of the API Server, this identifies the base url needed for all API requests. For this demonstration we are on the Sandbox environment in the region Us-West so our base api url is https://sandboxapi.ordercloud.io, yours may look different.
2. For this demonstration we will be creating a single sign on experience for buyer users so we'll create the most basic entities required to support that scenario.
    1. [Create a buyer organization](https://ordercloud.io/api-reference/buyers/buyers/create)
        ```http
        POST https://sandboxapi.ordercloud.io/v1/buyers HTTP/1.1
        Authentication: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
        Content-Type: application/json; charset=UTF-8

        {
            "ID": "buyer1",
            "Name": "Buyer 1",
            "Active": true
        }
        ```
    2. [Create a Security profile](https://ordercloud.io/api-reference/authentication-and-authorization/security-profiles/create)
        ```http
        POST https://sandboxapi.ordercloud.io/v1/buyers HTTP/1.1
        Authentication: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
        Content-Type: application/json; charset=UTF-8

        {
            "ID": "buyerProfile",
            "Name": "Buyer Security Profile",
            "Roles": ["Shopper"]
        }
        ```
    3. [Assign the security profile to the buyer organization](https://ordercloud.io/api-reference/authentication-and-authorization/security-profiles/save-assignment)
        ```http
        POST https://sandboxapi.ordercloud.io/v1/securityprofiles/assignments HTTP/1.1
        Authentication: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
        Content-Type: application/json; charset=UTF-8

        {
            "SecurityProfileID": "buyerProfile",
            "BuyerID": "buyer1"
        }
        ```
    4. [Create an API Client](https://ordercloud.io/api-reference/seller/api-clients/create)
        ```http
        POST https://sandboxapi.ordercloud.io/v1/apiclients HTTP/1.1
        Authentication: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
        Content-Type: application/json; charset=UTF-8

        {
            "AccessTokenDuration": 600,
            "Active": true,
            "AppName": "Buyer Client",
            "RefreshTokenDuration": 43200,
            "AllowAnyBuyer": true,
            "AllowSeller": true
        }
        ```
        Make sure to record the ID from the response. You will need it for step #6

3. For this demonstration we'll need a publicly available endpoint. Instead of deploying something, we can use [ngrok](https://ngrok.com/). After installing ngrok run `ngrok http 4451`. This tells ngrok to expose our endpoint (not yet running) on http://localhost:4451 to two public endpoints. After running the command copy either one of those urls and record it, we'll need it for step #4. We recommend to keep ngrok running, restarting it will generate unique public endpoints and require you to update your configuration in OrderCloud.

4. [Create an OpenIDConnect Integration Event](https://ordercloud.io/api-reference/seller/integration-events/create). Refer to the table below for more detail on the properties for this entity.

    ```http
    POST https://sandboxapi.ordercloud.io/v1/integrationEvents HTTP/1.1
    Authentication: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
    Content-Type: application/json; charset=UTF-8

    {
        "ID": "openidconnect",
        "Name": "openidconnect",
        "EventType": "OpenIDConnect",
        "CustomImplementationUrl": "{your-ngrok-url}/integration-events",
        "HashKey": "supersecrethash",
        "ElevatedRoles": ["BuyerUserAdmin"]
    }
    ```

| OrderCloud Property     | Description                                                                                                                                                                                                                                                   |
|-------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ID                      | Unique identifier for the integration event                                                                                                                                                                                                                   |
| Name                    | A short name describing the integration event, this is not user facing                                                                                                                                                                                        |
| EventType               | Indicates what type of integration event this is, in our case we should use OpenIDConnect                                                                                                                                                                     |
| CustomImplementationUrl | This indicates the base URL of your middleware where OrderCloud should post to. For OpenIDConnect it will call out to the path /createuser and /syncuser                                                                                                      |
| HashKey                 | This is an important security feature that is used by your middleware to validate that requests made to your endpoints are legitimate and come from OrderCloud                                                                                                |
| ElevatedRoles           | An optional array of roles that will encoded in the user's token and sent along in the payload to /createuser and /syncuser. In our case we are defining BuyerUserAdmin so that our middleware endpoints have the roles necessary to create users on the fly. |

5. Follow [google's instructions](https://developers.google.com/identity/protocols/oauth2/openid-connect) for setting up openid connect on their side. You'll need to set the authorized redirect URI to `https://sandboxapi.ordercloud.io/ocrpcode`. Take note of the `clientID` and `clientSecret` which OrderCloud will refer to as `ConnectClientID` and `ConnectClientSecret` respectively, these values will be needed in the following step.

6. Create a new [Open ID Connect](https://ordercloud.io/api-reference/authentication-and-authorization/open-id-connects/create). This entity configures OIDC between Google and OrderCloud. Refer to the table below for more detail on the properties of this entity.

    ```http
    POST https://sandboxapi.ordercloud.io/v1/openidconnects HTTP/1.1
    Authentication: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...

    Content-Type: application/json; charset=UTF-8

    {
        "ID": "google",
        "OrderCloudApiClientID": "CLIENT_ID_FROM_STEP_3",
        "ConnectClientID": "PUT_GOOGLE_CLIENT_ID_HERE",
        "ConnectClientSecret": "PUT_GOOGLE_CLIENT_SECRET_HERE",
        "AppStartUrl": "http://localhost:4451?token={0}&idpToken={1}",
        "AuthorizationEndpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "TokenEndpoint": "https://oauth2.googleapis.com/token",
        "UrlEncoded": false,
        "CallSyncUserIntegrationEvent": true,
        "IntegrationEventID": "openidconnect",
        "AdditionalIdpScopes": null
    }
    ```

    | OrderCloud Property     | Description                                                                                                                                                                                                                |
    |-------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
    | `ID`                    | Unique identifier for the connect client config                                                                                                                                                                            |
    | `OrderCloudApiClientID` | This is the clientID (on OrderCloud) that wants to authenticate via OpenID Connect                                                                                                                                         |
    | `ConnectClientID`       | This is the clientID of the identify provider (in this case Google)                                                                                                                                                        |
    | `ConnectClientSecret`   | This is the clientSecret of the identity provider (in this case Google)                                                                                                                                                    |
    | `AppStartUrl`           | This is where the user will be redirected to after successful authentication via OpenID Connect. The parameter `{0}` represents the token. The parameter `{1} represents the IDP token, and the parameter {2} which is not used here represents the app start path used for deep linking`                                                                                  |
    | `AuthorizationEndpoint` | Defined by the OpenID provider (in this case Google). It is the endpoint OrderCloud will redirect user to in order to validate credentials.                                                                                |
    | `TokenEndpoint`         | Defined by the OpenID provider (in this case Google). It is the endpoint OrderCloud will call out to get a token from the provider.                                                                                        |
    | `UrlEncoded`            | How to post information to the OpenID provider (in this case Google). It is sent with either Basic Auth if UrlEncoded is `false`, otherwise it posts a Url encoded body. Most providers (such as Google) will accept both. If you encounter an error with your provider a good first step for troubleshooting is changing this value to the opposite of what its set. |
    | `CallSyncUserIntegrationEvent`            | Whether or not the /syncuser endpoint will be called which is used to update user details that may have changed after their initial login |
    | `IntegrationEventID`    | The ID to the Integration Event created in step 2. This has information about which endpoint OrderCloud should call out to in order to create the user after the user has successfully logged in.                                                                                                                                   |
    | `AdditionalIdpScopes`   | As defined by the OIDC specification we will request profile, email, and oidc scope but you may request any additional scopes you'd like to request from the IDP at the time of authentication. As an example you could request permissions from google to access user's google drive files, then the access token you get back from the IDP would have permission to do that. Please note that these roles will show up in the user consent screen and best practices dictate to only request those that you absolutely need for your application                                                                                         
                                                                                                  |
7. Review the settings in index.html:
    - `ORDERCLOUD_CLIENT_ID` - the clientID that wants to authenticate via OpenID connect
    - `ORDERCLOUD_BASE_API_URL` - the base api url for interacting with your ordercloud marketplace. This will vary based on region and environment
    - `ORDERCLOUD_OPEN_ID_CONNECT_ID` - the ID to the Open ID Connect configuration you created on OrderCloud
    - `ORDERCLOUD_ROLES` - the roles to request, only roles that are also part of the security profile assigned to the user will be granted

8. Review the settings in server.js
    - `ORDERCLOUD_BASE_API_URL` - the base api url for interacting with your ordercloud marketplace. This will vary based on region and environment
    - `ORDERCLOUD_BUYER_ID` - the ID to your buyer organization

9. run `npm install` to download the dependencies and then run `npm run start` at the root of the project. Open a browser window and navigate to http://localhost:4451. If everything went well you should be redirected to google's sign in page. After successfully signing in, you'll be redirected back to the app and you should see an alert with your new OrderCloud token as well as Google's IDP token. Check out server.js to see the user create logic that occurs.
