'use strict';

/**
 * Basically this feature is getting the post of current
 * Log-in user from the home and community menu
 */

const _ = require('lodash');
const lib = require('../../lib');

/**
 * Validation of req.body, req, param,
 * and req.query
 * @param {any} req request object
 * @param {any} res response object
 * @param {any} next next object
 * @returns {next} returns the next handler - success response
 * @returns {rpc} returns the validation error - failed response
 */
function validateParams (req, res, next) {
  let paramsSchema = {
    offset: {
      optional: true,
      isInt: {
        errorMessage: 'Invalid Resource: Offset'
      }
    },
    limit: {
      optional: true,
      isInt: {
        errorMessage: 'Invalid Resource: Limit'
      }
    }
  };

  req.checkParams(paramsSchema);
  return req.getValidationResult()
  .then(validationErrors => {
    if (validationErrors.array().length !== 0) {
      return res.status(400)
      .send(new lib.rpc.ValidationError(validationErrors.array()));
    }

    return next();
  })
  .catch(error => {
    res.status(500)
    .send(new lib.rpc.InternalError(error));
  });
}

function getPosts (req, res, next) {
  let user = req.$scope.user;
  let offset = req.$params.offset;
  let limit = req.$params.limit;
  const sequelize = req.db.postRating.sequelize;
  const colRating = sequelize.col(['postRating', 'rating'].join('.'));
  const colAVG = sequelize.fn('AVG', colRating);

  return req.db.post.findAll({
    attributes: [
      'message',
      'title',
      'createdAt', [sequelize.fn('ROUND', colAVG, 2), 'roundedRating'],
      [sequelize.fn('COUNT',
        sequelize.col(['postRating', 'userId'].join('.'))), 'ratingCount'],
      [sequelize.fn('COUNT',
        sequelize.col(['postLike', 'userId'].join('.'))), 'likeCount'],
      [sequelize.fn('COUNT',
        sequelize.col(['postPageview', 'userId'].join('.'))), 'pageviewCount'],
      [sequelize.fn('COUNT',
        sequelize.col(['postShare', 'sharePostId'].join('.'))), 'shareCount']
    ],
    include: [{
      model: req.db.user,
      attributes: ['id', 'firstName', 'lastName', 'email', 'schoolName']
    }, {
      model: req.db.postRating,
      as: 'postRating',
      attributes: []
    }, {
      model: req.db.postLike,
      as: 'postLike',
      attributes: []
    }, {
      model: req.db.postReply,
      as: 'postReply',
      attributes: ['comment', 'createdAt'],
      include: [{
        model: req.db.user,
        attributes: ['id', 'firstName', 'lastName', 'email']
      }]
    }, {
      model: req.db.postPageview,
      as: 'postPageview',
      attributes: []
    }, {
      model: req.db.post,
      foreignKey: 'sharePostId',
      as: 'postShare',
      attributes: []
    }],
    group: ['post.id'],
    order: [['createdAt', 'DESC']],
    where: {
      [req.Op.or]: [{
        userId: {
          [req.Op.eq]: user.id
        }
      }, {
        postTo: {
          [req.Op.eq]: user.id
        }
      }]
    },
    subQuery: false,
    offset: !offset ? 0 : parseInt(offset),
    limit: !limit ? 10 / 2 : parseInt(limit) / 2
  })
  .then(posts => {
    req.$scope.posts = posts;
    next();
    return posts;
  })
  .catch(error => {
    res.status(500)
    .send(new lib.rpc.InternalError(error));

    req.log.error({
      err: error.message
    }, 'post.findAll Error - get-post');
  });
}

function getCommunityPosts (req, res, next) {// eslint-disable-line id-length
  let user = req.$scope.user;
  let offset = req.$params.offset;
  let limit = req.$params.limit;
  const sequelize = req.db.communityPostRating.sequelize;
  const colRating = sequelize.col('postRating.rating');
  const colAVG = sequelize.fn('AVG', colRating);
  return req.db.communityPost.findAll({
    attributes: [
      'message',
      'createdAt',
      [sequelize.fn('ROUND', colAVG, 2), 'roundedRating'],
      [sequelize.fn('COUNT',
        sequelize.col(['postRating', 'userId'].join('.'))), 'ratingCount'],
      [sequelize.fn('COUNT',
        sequelize.col(['postLike', 'userId'].join('.'))), 'likeCount'],
      [sequelize.fn('COUNT',
        sequelize.col(['postPageview', 'userId'].join('.'))), 'pageviewCount']
    ],
    include: [{
      model: req.db.user,
      attributes: ['id', 'firstName', 'lastName', 'email']
    }, {
      model: req.db.communityPostRating,
      as: 'postRating',
      attributes: []
    }, {
      model: req.db.communityPostLike,
      as: 'postLike',
      attributes: []
    }, {
      model: req.db.communityPostPageview,
      as: 'postPageview',
      attributes: []
    }, {
      model: req.db.communityPostReply,
      as: 'postReply',
      attributes: ['comment', 'createdAt'],
      include: [{
        model: req.db.user,
        attributes: ['id', 'firstName', 'lastName', 'email']
      }]
    }],
    where: {
      [req.Op.and]: {
        communityId: {
          [req.Op.eq]: null
        },
        userId: {
          [req.Op.eq]: user.id
        }
      }
    },
    group: ['communityPost.id'],
    order: [['createdAt', 'DESC']],
    subQuery: false,
    offset: !offset ? 0 : parseInt(offset),
    limit: !limit ? 10 / 2 : parseInt(limit) / 2
  })
  .then(communityPosts => {
    req.$scope.communityPosts = communityPosts;
    next();
    return communityPosts;
  })
  .catch(error => {
    res.status(500)
    .send(new lib.rpc.InternalError(error));

    req.log.error({
      err: error.message
    }, 'postLike.create Error - get-community-posts');
  });
}

/**
 * Response data to client
 * @param {any} req request object
 * @param {any} res response object
 * @returns {any} body response object
 */
function response (req, res) {
  let posts = req.$scope.posts;
  let communityPosts = req.$scope.communityPosts;
  posts = posts.concat(communityPosts);
  _.orderBy(posts, ['createdAt'], ['desc']);

  let body = {
    status: 'SUCCESS',
    status_code: 0,
    http_code: 200,
    posts: posts
  };

  res.status(200).send(body);
}

module.exports.validateParams = validateParams;
module.exports.getPosts = getPosts;
module.exports.getCommunityPosts = getCommunityPosts;
module.exports.response = response;