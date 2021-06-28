import axios from "axios";
import * as Realm from "realm-web";

import "services/storage-json";
import "services/async-property";

import { actions } from "./reducer";

export const SESSION_REALM_TOKENS_KEY = "realmTokens";

const realmApp = new Realm.App({
  id: process.env.REACT_APP_REALM_APP_ID,
});

const ignoreAbortError = (err) => {
  if (!err instanceof Error || err.name !== "AbortError") {
    throw err;
  }
};

function createHttpRealm(tokens, dispatch) {
  const { access_token } = tokens,
    http = axios.create({
      baseURL: process.env.REACT_APP_BASE_URL_REALM,
      headers: {
        "Content-type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
    });

  http.interceptors.request.use((config) => {
    dispatch(actions.IN_FLIGHT_BEGIN);
    return config;
  });
  http.interceptors.response.use((response) => {
    dispatch(actions.IN_FLIGHT_COMPLETE);
    return response;
  });

  dispatch(actions.CHANGE_USER, tokens);
  return http;
}

class RealmAPI {
  constructor(dispatch) {
    this.dispatch = dispatch;

    // API gateways are created in suspense:  represents a promise that
    //  will be resolved later (through a setter), and has an async getter
    Object.defineAsyncProperty(this, "httpRealm");
    Object.defineAsyncProperty(this, "realmUser");
  }

  async auth(user) {
    // prepare axios client to pass authorization to webhooks
    this.authHttp();

    // and also authenticate Realm-Web SDK
    this.authRealmSDK(user);
  }

  authHttp() {
    const tokens = sessionStorage.getJSONItem(SESSION_REALM_TOKENS_KEY, {}),
      dispatch = this.dispatch;

    if ("access_token" in tokens) {
      // TODO: verify or refresh access_token
      this.httpRealm = createHttpRealm(tokens, dispatch);
      return;
    }

    console.info("getting realm anonymous user credential");
    axios
      .request({
        url: process.env.REACT_APP_BASE_URL_REALM_AUTH_ANON,
        method: "POST",
        headers: {
          "Content-type": "application/json",
        },
      })
      .then(({ data: tokens }) => {
        sessionStorage.setJSONItem(SESSION_REALM_TOKENS_KEY, tokens);
        this.httpRealm = createHttpRealm(tokens, dispatch);
      });
  }

  authRefresh(tokens) {
    const { access_token, refresh_token } = tokens,
      dispatch = this.dispatch;

    // issue only one token refresh request per 5 minutes
    if (this.refreshInProgress) {
      console.info("token refresh already in progress");
      return;
    } else {
      this.refreshInProgress = true;
      setTimeout(() => {
        delete this.refreshInProgress;
      }, 5 * 60 * 1000);
    }

    console.log("refreshing realm access token", access_token);
    axios
      .request({
        url: process.env.REACT_APP_BASE_URL_REALM_AUTH_REFRESH,
        method: "POST",
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${refresh_token}`,
        },
      })
      .then(({ data }) => {
        tokens = {...tokens, ...data};  // over-write the old access_token
        sessionStorage.setJSONItem(SESSION_REALM_TOKENS_KEY, tokens);
        this.httpRealm = createHttpRealm(tokens, dispatch);
      });
  }

  authRealmSDK() {
    // if user has a credential and Google authentication provider is enabled:
    // return realmApp.logIn(Realm.Credentials.google(user.google.credential));

    // skip, it's not used!
    return; // eslint-disable-next-line
    console.info("logging into realm app anonymously");
    realmApp.logIn(Realm.Credentials.anonymous()).then((user) => {
      this.realmUser = user;
    });
  }

  async getCuisines() {
    console.assert("deprecated")
    const source = axios.CancelToken.source(),
      q = this.httpRealm
        .then((http) => http.get("cuisines", { cancelToken: source.token }))
        .then(({ data }) => this.dispatch(actions.GET_CUISINES, data))
        .catch(ignoreAbortError);

    // why returning the promise, and not just the cancel (cleanup) function?
    q.cancel = source.cancel;
    return q;
  }

  async getRestaurants(page = {}, query = {}) {
    // TODO: shouldn't we check if state is already up-to-date with parameters?
    // can state be inspected (read-only, of course!) from this.dispatch?
    // I could dispatch an action with a conditional callback, but then I wouldn't
    //  be able to return the [cancelable] Promise...sad :(

    //TODO: caching --> use graphql & ApolloClient, lol.

    const source = axios.CancelToken.source(),
      q = this.httpRealm
        .then((http) =>
          http.get("restaurants", {
            params: new URLSearchParams({ ...query, ...page }),
            cancelToken: source.token,
          })
        )
        .then(({ data }) =>
          this.dispatch(actions.GET_RESTAURANTS, { query, ...data })
        )
        .catch(ignoreAbortError);

    // why returning the promise, and not just the cancel (cleanup) function?
    q.cancel = source.cancel;
    return q;
  }

  async getRestaurant(id) {
    console.assert("deprecated")
    return this.httpRealm
      .then((http) =>
        http.get("restaurants", {
          params: new URLSearchParams({ id }),
        })
      )
      .then(({ data: restaurant }) =>
        this.dispatch(actions.GET_RESTAURANT, restaurant)
      );
  }

  async createReview(data) {
    this.dispatch(actions.ADD_REVIEW, data); // optimistic
    return this.httpRealm.then((http) => http.post("reviews", data));
    // TODO: catch failure, invalidate restaurant
  }

  async updateReview(id, { userId, ...data }) {
    this.dispatch(actions.EDIT_REVIEW, { id, userId, ...data }); // optimistic
    return this.httpRealm.then((http) =>
      http.put("reviews", data, {
        params: new URLSearchParams({ id, userId }),
      })
    );
    // TODO: catch failure, invalidate restaurant
  }

  async deleteReview(id, userId, restaurantId) {
    this.dispatch(actions.DELETE_REVIEW, { id, restaurantId }); // optimistic
    return this.httpRealm.then((http) =>
      http.delete("reviews", { params: new URLSearchParams({ id, userId }) })
    );
    // TODO: catch failure, invalidate restaurant
  }

  // TODO: add more actions!
}

export default RealmAPI;
