exports.run = message => {
	if (message.author.melon === true) return message.author.melon = false;
	if (!message.author.melon) return message.author.melon = true;
};

exports.config = {
	enabled: true,
	permLevel: 2,
	category: 'eggs'
};

exports.meta = {
	command: 'melon',
	name: 'melon',
	description: 'A special easter egg for melon.',
	usage: 'melon',
	help: 'Quite the different easter egg.'
};