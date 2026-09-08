// import axios from 'axios';
// import { ENV_GOOGLE_API_KEY, ENV_GOOGLE_LOCATION_ID } from '../config/config.js';
// export interface GoogleReview {
//   author_name: string;
//   rating: number;
//   text: string;
//   relative_time_description: string;
//   time: number;
// }
// export interface GoogleReviewsData {
//   name: string;
//   rating: number;
//   reviews: GoogleReview[];
// }
// export module googlereviewService {
//     export async function fetchGoogleReviews(): Promise<GoogleReviewsData> {
//   const url = `https://places.googleapis.com/v1/places/${place_id}`;
//   const params = {
//     place_id: ENV_GOOGLE_LOCATION_ID,
//     fields: 'name,rating,reviews',
//     key: ENV_GOOGLE_API_KEY,
//   };
//   const res = await axios.get(url, { params });
//   if (res.data.status !== 'OK') {
//     throw new Error(res.data.error_message || 'Failed to fetch place details');
//   }
//   const { name, rating, reviews } = res.data.result;
//   return { name, rating, reviews };
// }
// }
import axios from 'axios';
import { ENV_GOOGLE_API_KEY, ENV_GOOGLE_LOCATION_ID } from '../config/config.js';
export var googlereviewService;
(function (googlereviewService) {
    async function fetchGoogleReviews() {
        const url = `https://places.googleapis.com/v1/places/${ENV_GOOGLE_LOCATION_ID}`;
        const headers = {
            'X-Goog-Api-Key': ENV_GOOGLE_API_KEY,
            'X-Goog-FieldMask': 'reviews,displayName,rating'
        };
        const res = await axios.get(url, { headers });
        if (res.status !== 200) {
            throw new Error(res.data?.error?.message || 'Failed to fetch place details');
        }
        // Response keys are displayName, reviews, rating (not "name"!)
        const { displayName, reviews, rating } = res.data;
        return { displayName, reviews, rating };
    }
    googlereviewService.fetchGoogleReviews = fetchGoogleReviews;
})(googlereviewService || (googlereviewService = {}));
//# sourceMappingURL=googlereview.service.js.map