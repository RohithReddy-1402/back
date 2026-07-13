import * as contactService from "../services/contact.service.js";

export const createContact = async (req, res, next) => {
  try {
    const contact = await contactService.create(req.body);

    res.status(200).json({
      success: true,
      message: "Message submitted successfully",
      data: contact,
    });
  } catch (error) {
    console.error("Error creating contact:", error);    
    next(error);
  }
};

export const getContacts = async (req, res, next) => {
  try {
    const contacts = await contactService.getAll();

    res.json({
      success: true,
      data: contacts,
    });
  } catch (error) {
    next(error);
  }
};

export const getContactById = async (req, res, next) => {
  try {
    const contact = await contactService.getById(req.params.id);

    res.json({
      success: true,
      data: contact,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteContact = async (req, res, next) => {
  try {
    await contactService.remove(req.params.id);

    res.json({
      success: true,
      message: "Contact deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};