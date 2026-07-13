import Contact from "../models/contact.js";

export const create = async (data) => {
  return await Contact.create(data);
};

export const getAll = async () => {
  return await Contact.find().sort({ createdAt: -1 });
};

export const getById = async (id) => {
  return await Contact.findById(id);
};

export const remove = async (id) => {
  return await Contact.findByIdAndDelete(id);
};