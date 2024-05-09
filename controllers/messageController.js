const asyncHandler = require('express-async-handler');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const Chat = require('../models/chat');

const storage = multer.memoryStorage();
const MB = 1048576;
const upload = multer({
	storage,
	limits: { fileSize: MB * 6 },
});

exports.message_list = asyncHandler(async (req, res, next) => {
	const chat = await Chat.findById(req.params.chatId).populate({
		path: 'messages',
		populate: [{ path: 'user' }],
	});
	const list = chat.messages;
	res.json({ list });
});

exports.message_create = [
	upload.single('file'),

	asyncHandler(async (req, res, next) => {
		const input = JSON.parse(req.body.json);
		req.body = input;
		next();
	}),

	body('text')
		.trim()
		.isLength({ max: 900 })
		.withMessage('Message exceeds character limit.'),

	asyncHandler(async (req, res, next) => {
		if (!req.file && !req.body.text) {
			return;
		}
		const errors = validationResult(req);

		if (!errors.isEmpty()) {
			const messages = errors.array().map((err) => err.msg);
			return res.status(400).send(messages);
		}

		const message = {
			user: res.locals.user._id,
			timestamp: new Date(),
			text: req.body.text ? req.body.text : null,
			image: req.file
				? `data:image/jpeg;base64,${req.file.buffer.toString('base64')}`
				: null,
		};

		const updatedChat = await Chat.findOneAndUpdate(
			{ _id: req.params.chatId },
			{
				$push: { messages: message },
				$set: { most_recent_update: new Date() },
			},
			{ new: true },
		);

		res.sendStatus(200);
	}),
];

exports.message_update = [
	body('text')
		.trim()
		.notEmpty()
		.withMessage('Messages cannot be empty.')
		.isLength({ max: 900 })
		.withMessage('Message exceeds character limit.')
		.custom(async (value, { req }) => {
			const chat = await Chat.findById(req.params.chatId).populate('messages');
			const message = chat.messages.id(req.params.messageId);

			if (value === message.text) {
				throw new Error('Duplicate text will not be saved.');
			}

			return true;
		}),

	asyncHandler(async (req, res, next) => {
		const errors = validationResult(req);

		if (
			errors
				.array()
				.map((error) => error.msg)
				.includes('Duplicate text will not be saved.')
		) {
			return res.sendStatus(200);
		}

		if (!errors.isEmpty()) {
			const messages = errors.array().map((err) => err.msg);
			return res.status(400).send(messages);
		}

		const updatedChat = await Chat.findOneAndUpdate(
			{ _id: req.params.chatId, 'messages._id': req.params.messageId },
			{ $set: { 'messages.$.text': req.body.text, 'messages.$.edited': true } },
			{ new: true },
		);

		res.sendStatus(200);
	}),
];

exports.message_delete = asyncHandler(async (req, res, next) => {
	const chat = await Chat.findOneAndUpdate(
		{ _id: req.params.chatId },
		{ $pull: { messages: { _id: req.params.messageId } } },
		{ new: true },
	);

	res.sendStatus(200);
});
