import actions from "./actions";

export default function realmReducer(state, { type, payload = {} }) {
  switch (type) {
    default:
    case actions.CHANGE_USER: // no-op since there's no confidential data to purge
      break;

    case actions.IN_FLIGHT_BEGIN:
    case actions.IN_FLIGHT_COMPLETE:
      const { inFlight: orig, ...rest } = state,
        inFlight = inFlightReducer(orig, { type, payload });
      if (inFlight) {
        return { ...rest, inFlight };
      }
      return rest;

    case actions.GET_CUISINES:
      return { ...state, cuisines: payload };

    case actions.GET_RESTAURANTS:
      return { ...state, restaurants: payload };

    case actions.GET_RESTAURANT:
      return {
        ...state,
        restaurantsById: { ...state.restaurantsById, [payload.id]: payload },
      };

    case actions.ADD_REVIEW:
    case actions.EDIT_REVIEW:
    case actions.DELETE_REVIEW: {
      const {
        restaurantsById: {
          [payload.restaurantId]: { reviews = [], ...restaurant } = {},
        },
      } = state;
      if (payload.restaurantId !== restaurant.id) break;
      return {
        ...state,
        restaurantsById: {
          ...state.restaurantsById,
          [payload.restaurantId]: {
            ...restaurant,
            reviews: reviewsReducer(reviews, { type, payload }),
          },
        },
      };
    }
  }

  return state;
}

function inFlightReducer(state = 0, { type }) {
  switch (type) {
    default:
      break;
    case actions.IN_FLIGHT_BEGIN:
      return state + 1;
    case actions.IN_FLIGHT_COMPLETE:
      return Math.max(state - 1, 0);
  }

  return state;
}

function reviewsReducer(state = [], { type, payload }) {
  switch (type) {
    default:
      break;
    case actions.ADD_REVIEW:
      return [payload, ...state];
    case actions.EDIT_REVIEW:
      return [payload, ...state.filter(({ id }) => id !== payload.id)];
    case actions.DELETE_REVIEW:
      return state.filter(({ id }) => id !== payload.id);
  }

  return state;
}
