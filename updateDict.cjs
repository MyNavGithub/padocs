const fs = require('fs');
const path = require('path');

const enPath = path.join(__dirname, 'src', 'i18n', 'en.json');
const frPath = path.join(__dirname, 'src', 'i18n', 'fr.json');

const enObj = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const frObj = JSON.parse(fs.readFileSync(frPath, 'utf8'));

// Templates additions
const tplAdditions = [
  ['errFailedToLoad', "Failed to load template", "Échec du chargement du modèle"],
  ['errPleaseUpload', "Please upload a .docx file", "Veuillez téléverser un fichier .docx"],
  ['errFailedToRead', "Failed to read file. Please try again.", "Échec de lecture du fichier. Veuillez réessayer."],
  ['errNoMarkersPathA', "No {field} markers found in this document. Either type them in Word first, or use Path B to add them here.", "Aucun marqueur {field} trouvé dans ce document. Tapez-les d'abord dans Word ou utilisez l'Option B pour les ajouter."],
  ['errFailedToParse', "Failed to parse document paragraphs.", "Échec d'analyse des paragraphes du document."],
  ['errAddOneField', "Please add at least one field before continuing.", "Veuillez ajouter au moins un champ avant de continuer."],
  ['errFailedToInject', "Failed to inject fields. Please try again.", "Échec de l'injection des champs. Veuillez réessayer."],
  ['errNameRequired', "Template name is required", "Le nom du modèle est requis"],
  ['errDocxRequired', "A .docx file is required", "Un fichier .docx est requis"],
  ['errFieldRequired', "At least one field is required", "Au moins un champ est requis"],
  ['errFailedToSave', "Failed to save template. Please try again.", "Échec d'enregistrement du modèle. Veuillez réessayer."],
  ['namePlaceholder', "e.g. Student Report Card", "ex: Bulletin de notes"],
  ['fieldsCountCount', "Fields ({{count}})", "Champs ({{count}})"],
  ['saveTemplateLabel', "Save Template", "Enregistrer le modèle"]
];

tplAdditions.forEach(([key, en, fr]) => {
  enObj.templates[key] = en;
  frObj.templates[key] = fr;
});

// Common additions
const commonAdditions = [
  ['add', 'Add', 'Ajouter'],
  ['update', 'Update', 'Mettre à jour'],
  ['saved', 'Saved!', 'Enregistré !'],
  ['required', 'Required', 'Requis'],
  ['default', 'Default:', 'Défaut :']
];

commonAdditions.forEach(([key, en, fr]) => {
  enObj.common[key] = en;
  frObj.common[key] = fr;
});

// Documents additions
const docAdditions = [
  ['templateNotFound', "Template not found", "Modèle introuvable"],
  ['loadFailed', "Failed to load template", "Échec du chargement du modèle"]
];

docAdditions.forEach(([key, en, fr]) => {
  enObj.documents[key] = en;
  frObj.documents[key] = fr;
});

// Auth additions
const authAdditions = [
  ['hidePassword', "Hide password", "Masquer le mot de passe"],
  ['showPassword', "Show password", "Afficher le mot de passe"]
];

authAdditions.forEach(([key, en, fr]) => {
  enObj.auth[key] = en;
  frObj.auth[key] = fr;
});

fs.writeFileSync(enPath, JSON.stringify(enObj, null, 2) + '\n');
fs.writeFileSync(frPath, JSON.stringify(frObj, null, 2) + '\n');
console.log('Dictionaries updated successfully.');
